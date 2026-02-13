const { google } = require('googleapis');

class GoogleAnalytics {
    constructor(config) {
        console.log("Google Analytics Plugin Initializing...");
        this.config = config || {};

        // Try to load token from environment if not passed in config
        if (!this.config.access_token) {
            try {
                if (process.env.OPENCLAW_CONNECTIONS) {
                    const connections = JSON.parse(process.env.OPENCLAW_CONNECTIONS);
                    if (connections.google && connections.google.access_token) {
                        this.config.access_token = connections.google.access_token;
                        console.log("Found Google Access Token in environment.");
                    }
                }
            } catch (e) {
                console.error("Failed to parse OPENCLAW_CONNECTIONS", e);
            }
        }
    }

    async _getAuth() {
        if (!this.config.access_token) {
            throw new Error("No Google access token found. Please connect your Google account in the dashboard.");
        }
        const auth = new google.auth.OAuth2();
        auth.setCredentials({ access_token: this.config.access_token });
        return auth;
    }

    /**
     * List all Google Analytics 4 properties accessible by the user.
     * Use this to find the property ID (e.g., properties/12345) for a specific website.
     * @returns {Promise<string>} A list of properties with their IDs and display names.
     */
    async listProperties() {
        console.log("Listing GA4 properties...");
        try {
            const auth = await this._getAuth();
            const analytics = google.analyticsadmin({ version: 'v1beta', auth });

            // List account summaries which include property summaries
            const res = await analytics.accountSummaries.list();

            if (!res.data.accountSummaries || res.data.accountSummaries.length === 0) {
                return "No Google Analytics accounts found.";
            }

            let output = "Found Google Analytics Properties:\n";
            let found = false;
            for (const account of res.data.accountSummaries) {
                if (account.propertySummaries) {
                    for (const prop of account.propertySummaries) {
                        output += `- **${prop.displayName}** (ID: \`${prop.property}\`)\n`;
                        found = true;
                    }
                }
            }

            if (!found) return "No properties found in your Google Analytics account.";
            return output;
        } catch (error) {
            console.error(error);
            return `Error listing properties: ${error.message}`;
        }
    }

    /**
     * Get a traffic report for a specific Google Analytics property.
     * @param {string} propertyId The GA4 property ID (e.g., 'properties/123456789'). You can get this from listProperties.
     * @param {string} [startDate='7daysAgo'] Start date (YYYY-MM-DD or '30daysAgo', '7daysAgo')
     * @param {string} [endDate='today'] End date (YYYY-MM-DD or 'today')
     * @returns {Promise<string>} A markdown table of traffic data (Active Users, Sessions).
     */
    async getReport(propertyId, startDate = '7daysAgo', endDate = 'today') {
        console.log(`Fetching report for ${propertyId}...`);
        try {
            const auth = await this._getAuth();
            const analyticsData = google.analyticsdata({ version: 'v1beta', auth });

            // Ensure propertyId has prefix
            let cleanPropertyId = propertyId;
            if (!cleanPropertyId.startsWith('properties/')) {
                // Check if it's just numbers
                if (/^\d+$/.test(cleanPropertyId)) {
                    cleanPropertyId = `properties/${cleanPropertyId}`;
                }
            }

            const response = await analyticsData.properties.runReport({
                property: cleanPropertyId,
                requestBody: {
                    dateRanges: [{ startDate, endDate }],
                    metrics: [{ name: 'activeUsers' }, { name: 'sessions' }],
                    dimensions: [{ name: 'date' }]
                },
            });

            if (!response.data.rows || response.data.rows.length === 0) {
                return `No data found for property ${cleanPropertyId} between ${startDate} and ${endDate}.`;
            }

            let output = `### Traffic Report for ${cleanPropertyId}\n`;
            output += `**Period:** ${startDate} to ${endDate}\n\n`;
            output += "| Date | Active Users | Sessions |\n";
            output += "|---|---|---|\n";

            // Sort by date if needed, but API usually returns chronological
            response.data.rows.forEach(row => {
                const date = row.dimensionValues[0].value; // YYYYMMDD usually
                // Format date to YYYY-MM-DD
                const formattedDate = `${date.substring(0, 4)}-${date.substring(4, 6)}-${date.substring(6, 8)}`;
                const users = row.metricValues[0].value;
                const sessions = row.metricValues[1].value;
                output += `| ${formattedDate} | ${users} | ${sessions} |\n`;
            });

            return output;

        } catch (error) {
            console.error(error);
            return `Error fetching report: ${error.message}`;
        }
    }
}

module.exports = GoogleAnalytics;
