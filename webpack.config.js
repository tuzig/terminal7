const path = require('path');

module.exports = {
    mode: "development",
    output: {filename: "terminal7.bundle.js"},
    performance: {maxAssetSize: 5000000},
    module: {rules: [{test: /\.css$/, use: ['style-loader', 'css-loader']}]},
    devServer: { host: "0.0.0.0"},
    devtool: "#eval-source-map"
};
