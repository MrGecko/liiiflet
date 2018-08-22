var path = require('path')
var webpack = require('webpack')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const BundleAnalyzerPlugin = require('webpack-bundle-analyzer').BundleAnalyzerPlugin;
const UglifyJsPlugin = require('uglifyjs-webpack-plugin');
const MiniCssExtractPlugin = require("mini-css-extract-plugin");

module.exports = {
    mode: 'development',
    entry: './src/liiiflet-src.js',
    output: {
        path: path.resolve(__dirname, '.'),
        publicPath: '',
        filename: 'dist/liiiflet.js'
    },
    module: {
        rules: [
            {
                test: /\.css$/,
                loader: "file-loader"
            },
            {
                test: /\.scss$/,
                use: [
                process.env.NODE_ENV !== 'production' ? 'style-loader' : MiniCssExtractPlugin.loader,
                "css-loader", // translates CSS into CommonJS
                "sass-loader" // compiles Sass to CSS
                ]
            },
            {
                test: /\.js$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: "babel-loader",
                    options: {
                        presets: ["@babel/preset-env"]
                    }
                }
            },
            {
                test: /\.(png|jpg|gif|svg)$/,
                loader: 'file-loader',
                options: {
                    name: '[name].[ext]',
                    outputPath: '../images'
                }
            }
        ]
    },
    resolve: {
        extensions: ['*', '.js', '.json']
    },
    devServer: {
        index: './index.html',
        contentBase: path.join(__dirname, '..'),
        historyApiFallback: true,
        noInfo: true,
        overlay: true,
        proxy: {
            '/': {
                target: 'http://localhost:5999',
                publicPath: '/static/js/liiiflet/',
                changeOrigin: true
            }
        }
    },
    performance: {
        hints: false
    },
    devtool: '#eval-source-map',
    optimization: {
        minimizer: [
            // we specify a custom UglifyJsPlugin here to get source maps in production
            new UglifyJsPlugin({
                cache: true,
                parallel: true,
                uglifyOptions: {
                    compress: false,
                    ecma: 6,
                    mangle: false
                },
                sourceMap: true
            })
        ]
    },
    plugins: [
        new MiniCssExtractPlugin({
            // Options similar to the same options in webpackOptions.output
            // both options are optional
            filename: "./dist/liiiflet.css",
            chunkFilename: "[id].css"
        }),
    ]
};

if (process.env.NODE_ENV === 'production') {
    module.exports.mode = 'production';
    module.exports.devtool = '#source-map';
    // http://vue-loader.vuejs.org/en/workflow/production.html
    module.exports.plugins = (module.exports.plugins || []).concat([
        new webpack.DefinePlugin({
            'process.env': {
                NODE_ENV: '"production"'
            }
        }),
        new webpack.LoaderOptionsPlugin({
            minimize: true
        }),
        new BundleAnalyzerPlugin({
            analyzerMode: 'static',
            openAnalyzer: false
        })
    ])
}
