class GoogleAnalytics {
    constructor(config = {}) {
        console.log("Google Analytics Plugin Loaded");
        this.config = config;
    }

    async getReport(viewId) {
        return {
            message: "Google Analytics Reporting Not Implemented Yet",
            viewId: viewId
        };
    }
}

module.exports = GoogleAnalytics;
