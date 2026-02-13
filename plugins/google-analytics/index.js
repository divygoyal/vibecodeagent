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
                    if (connections.google) {
                        this.config.access_token = connections.google.accessToken || connections.google.access_token;
                        this.config.refresh_token = connections.google.refreshToken || connections.google.refresh_token;
                        console.log("Found Google credentials in environment.");
                    }
                }
            } catch (e) {
                console.error("Failed to parse OPENCLAW_CONNECTIONS", e);
            }
        }
    }

    async _getAuth() {
        if (!this.config.access_token && !this.config.refresh_token) {
            throw new Error("No Google credentials found. Please connect your Google account in the dashboard.");
        }
        // Initialize OAuth client with credentials from environment (injected by DockerManager)
        // or fallback to process.env (for local dev)
        const clientId = process.env.GOOGLE_CLIENT_ID;
        const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            console.error("Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment");
            // We can't refresh without these, but maybe we have a valid access token?
            // Proceeding might fail later if token expires.
        }

        const auth = new google.auth.OAuth2(
            clientId,
            clientSecret
        );

        auth.setCredentials({
            access_token: this.config.access_token,
            refresh_token: this.config.refresh_token
        });

        // Proactively check/refresh token to ensure validity
        // This handles cases where the injected access_token is already expired
        try {
            const { token } = await auth.getAccessToken();
            if (token) {
                auth.setCredentials({ access_token: token });
            }
        } catch (e) {
            console.error("Failed to refresh Google token:", e.message);
            // We proceed, but the next call will likely fail 
            // causing the bot to prompt for re-auth if configured.
            // But let's throw to make it clear in logs.
            throw new Error(`Google authentication failed: ${e.message}. Please reconnect in dashboard.`);
        }

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

// CLI Handling Logic
if (require.main === module) {
    (async () => {
        const args = process.argv.slice(2);
        const command = args[0];

        try {
            const plugin = new GoogleAnalytics();

            if (command === 'list-properties') {
                const result = await plugin.listProperties();
                console.log(result);
            } else if (command === 'get-report') {
                const propertyId = args[1];
                const startDate = args[2];
                const endDate = args[3];

                if (!propertyId) {
                    console.error("Error: propertyId is required for get-report");
                    process.exit(1);
                }

                const result = await plugin.getReport(propertyId, startDate, endDate);
                console.log(result);
            } else {
                console.error("Unknown command. Available: list-properties, get-report");
                process.exit(1);
            }
        } catch (error) {
            console.error("Error running command:", error.message);
            process.exit(1);
        }
    })();
}

module.exports = GoogleAnalytics;
