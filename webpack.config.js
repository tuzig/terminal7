const path = require('path');
const {GenerateSW} = require('workbox-webpack-plugin');
const genRanHex = (size = 24) => [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('');

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
            enforce: 'pre',
            test: /\.js$/,
            include: [ path.resolve(__dirname, 'src'),
                path.resolve(__dirname, 'node_modules', 'xterm', 'lib')
            ],
            use: ['source-map-loader'],
          }, {
            test: /\.tsx?$/,
            use: 'ts-loader',
            exclude: /node_modules/,
          },
    ]},
    devServer: { host: "0.0.0.0"},
    devtool: "inline-source-map",
    plugins: [ new GenerateSW({
        clientsClaim: true,
        skipWaiting: true
        /*,
        additionalManifestEntries: [
            {
                "url": "/fonts/FiraSansCondensed-Regular.ttf",
                "revision": "1"
            }, {
                "url": "/fonts/FiraCode-VariableFont_wght.ttf",
                "revision": "1"
            }, {
                "url": "/fonts/Framework7Icons-Regular.eot",
                "revision": "1"
            }, {
                "url": "/fonts/Framework7Icons-Regular.ttf",
                "revision": "1"
            }, {
                "url": "/fonts/Framework7Icons-Regular.woff",
                "revision": "1"
            }, {
                "url": "/fonts/Framework7Icons-Regular.woff2",
                "revision": "1"
            }
        ] 
        */
    })]
};
