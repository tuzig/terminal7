const path = require('path');

module.exports = {
    mode: "development",
    output: {
        path: path.resolve(__dirname, 'www'),
        filename: "terminal7.bundle.js"
    },
    performance: {maxAssetSize: 5000000},
    module: {rules: [
        {test: /\.css$/, use: ['style-loader', 'css-loader']},
        {
            test: /\.(woff2?|eot|ttf|otf)(\?.*)?$/,
            loader: 'url-loader',
            options: {
              limit: 10000,
              name: 'fonts/[name].[ext]',
            },
        }, {
            test: /\.js$/,
            enforce: 'pre',
            use: ['source-map-loader'],
          },
    ]},
    devServer: { host: "0.0.0.0"},
    devtool: "inline-source-map"
};
