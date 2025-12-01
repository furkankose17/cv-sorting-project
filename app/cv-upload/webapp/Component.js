sap.ui.define([
    "sap/ui/core/UIComponent",
    "sap/ui/Device",
    "cv/sorting/cvupload/model/models"
], function (UIComponent, Device, models) {
    "use strict";

    return UIComponent.extend("cv.sorting.cvupload.Component", {
        metadata: {
            manifest: "json"
        },

        /**
         * Initialize the component
         */
        init: function () {
            // Call parent init
            UIComponent.prototype.init.apply(this, arguments);

            // Set device model
            this.setModel(models.createDeviceModel(), "device");

            // Initialize router
            this.getRouter().initialize();
        },

        /**
         * Cleanup on destroy
         */
        destroy: function () {
            UIComponent.prototype.destroy.apply(this, arguments);
        },

        /**
         * Get content density class based on device
         */
        getContentDensityClass: function () {
            if (!this._sContentDensityClass) {
                if (!Device.support.touch) {
                    this._sContentDensityClass = "sapUiSizeCompact";
                } else {
                    this._sContentDensityClass = "sapUiSizeCozy";
                }
            }
            return this._sContentDensityClass;
        }
    });
});
