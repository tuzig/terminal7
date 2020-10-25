cordova.define('cordova/plugin_list', function(require, exports, module) {
  module.exports = [
    {
      "id": "cordova-plugin-inappbrowser.inappbrowser",
      "file": "plugins/cordova-plugin-inappbrowser/www/inappbrowser.js",
      "pluginId": "cordova-plugin-inappbrowser",
      "clobbers": [
        "cordova.InAppBrowser.open"
      ]
    },
    {
      "id": "cordova-plugin-network-information.network",
      "file": "plugins/cordova-plugin-network-information/www/network.js",
      "pluginId": "cordova-plugin-network-information",
      "clobbers": [
        "navigator.connection",
        "navigator.network.connection"
      ]
    },
    {
      "id": "cordova-plugin-network-information.Connection",
      "file": "plugins/cordova-plugin-network-information/www/Connection.js",
      "pluginId": "cordova-plugin-network-information",
      "clobbers": [
        "Connection"
      ]
    },
    {
      "id": "cordova-plugin-statusbar.statusbar",
      "file": "plugins/cordova-plugin-statusbar/www/statusbar.js",
      "pluginId": "cordova-plugin-statusbar",
      "clobbers": [
        "window.StatusBar"
      ]
    },
    {
      "id": "cordova-plugin-ssh-connect.sshConnect",
      "file": "plugins/cordova-plugin-ssh-connect/www/sshConnect.js",
      "pluginId": "cordova-plugin-ssh-connect",
      "clobbers": [
        "cordova.plugins.sshConnect"
      ]
    },
    {
      "id": "cordova-clipboard.Clipboard",
      "file": "plugins/cordova-clipboard/www/clipboard.js",
      "pluginId": "cordova-clipboard",
      "clobbers": [
        "cordova.plugins.clipboard"
      ]
    }
  ];
  module.exports.metadata = {
    "cordova-plugin-inappbrowser": "4.0.0",
    "cordova-plugin-network-information": "2.0.2",
    "cordova-plugin-statusbar": "2.4.3",
    "cordova-plugin-webpack": "1.0.5",
    "cordova-plugin-whitelist": "1.3.4",
    "cordova-plugin-add-swift-support": "1.7.2",
    "cordova-plugin-ssh-connect": "1.1.1",
    "cordova-clipboard": "1.3.0"
  };
});