sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
    "use strict";

    return UIComponent.extend("mlshowcase.Component", {

        metadata: {
            manifest: "json"
        },

        init: function () {
            // Call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // Create the views based on the url/hash
            this.getRouter().initialize();

            // Set device model
            const oDeviceModel = new JSONModel(sap.ui.Device);
            oDeviceModel.setDefaultBindingMode("OneWay");
            this.setModel(oDeviceModel, "device");

            // Create app state model
            const oAppModel = new JSONModel({
                mlServiceUrl: window.location.hostname === "localhost"
                    ? "http://localhost:8000"
                    : "/ml-api",
                serviceStatus: "checking",
                lastChecked: null,
                endpoints: {
                    health: { status: "idle", response: null },
                    embeddings: { status: "idle", response: null },
                    search: { status: "idle", response: null },
                    similar: { status: "idle", response: null },
                    matching: { status: "idle", response: null },
                    ocr: { status: "idle", response: null }
                }
            });
            this.setModel(oAppModel, "app");
        }
    });
});
