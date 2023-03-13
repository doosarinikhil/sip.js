/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable no-undef */
const path = require("path");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const Dotenv = require('dotenv-webpack');
module.exports = {
  entry: {
        main: './src/index.tsx',
        sharedWorker: './src/worker.ts'
    },
  output: {
    path: path.resolve(__dirname, "build"),
    filename: '[name].bundle.js',
        globalObject: 'this',
  },
  module: {
    rules: [
      {
        test: /\.m?js$/,
        resolve: {
            fullySpecified: false
        }
    },
      {
        test: /\.(js|jsx)$/,
        exclude: /node_modules/,
        include: /node_modules\/sip.js\/lib/,
        use: ["babel-loader"],
      },
      {
        test: /\.(ts|tsx)$/,
        loader: "ts-loader",
      },
    ],
  },
  resolve: {
    extensions: ["*", ".js", ".jsx", ".ts", ".tsx"],
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: path.join(__dirname, "public", "index.html"),
    }),
    new Dotenv()
  ],
  devtool: 'eval-source-map',
  devServer: {
    static: {
      directory: path.join(__dirname, "build"),
    },
    port: 3000,
  },
};
