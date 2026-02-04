// webpack.config.shared-worker.js
const path = require('path');
const webpack = require('webpack');
const TerserPlugin = require('terser-webpack-plugin');
const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

// Detect environment
const isProduction = process.env.NODE_ENV === 'production';
const analyzeBundle = process.env.ANALYZE === 'true';

// Get absolute path to project root
const projectRoot = path.resolve(__dirname);

module.exports = {
  mode: isProduction ? 'production' : 'development',
  target: 'webworker', // Important for shared-worker context
  entry: {
    'pubsub-worker': path.join(projectRoot, 'src/app/core/communication/workers/shared-worker/pubsub/pubsub-worker.ts'),
  },
  output: {
    // Use [name] to output multiple files
    filename: '[name].js',
    path: path.resolve(__dirname, 'dist/js'),
    publicPath: '/assets/js/',
    globalObject: 'self', // Required for workers
    clean: true
  },
  resolve: {
    extensions: ['.ts', '.js', '.json'],
    alias: {
      '@app': path.join(projectRoot, 'src/app'),
      //'@env': path.resolve(__dirname, 'src/environments'),
      //'@shared-worker': path.resolve(__dirname, 'src/app/shared-worker')
    },
    fallback: {
      // Polyfills for Node.js modules that might be used
      'path': false,
      'fs': false,
      'os': false,
      'crypto': false
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: [
          {
            loader: 'ts-loader',
            options: {
              configFile: 'tsconfig.shared-worker.json',
              transpileOnly: false, // Enable type checking
              compilerOptions: {
                sourceMap: !isProduction,
                declaration: false
              }
            }
          }
        ],
        exclude: /node_modules/
      },
      {
        test: /\.js$/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: [
              ['@babel/preset-env', {
                targets: {
                  browsers: ['last 2 versions']
                },
                modules: false,
                useBuiltIns: 'usage',
                corejs: 3
              }]
            ]
          }
        },
        exclude: /node_modules/
      },
      // Handle JSON files
      {
        test: /\.json$/,
        type: 'json'
      }
    ]
  },
  optimization: {
    minimize: isProduction,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          compress: {
            drop_console: isProduction,
            drop_debugger: isProduction,
            pure_funcs: isProduction ? ['console.log', 'console.debug'] : []
          },
          mangle: isProduction,
          output: {
            comments: false,
            beautify: !isProduction
          }
        },
        extractComments: false,
        parallel: true
      })
    ],
    concatenateModules: isProduction, // Module concatenation
    usedExports: true, // Tree shaking
    sideEffects: true, // Remove unused modules
    splitChunks: false, // No code splitting for shared-worker (single file)
    runtimeChunk: false // No runtime chunk
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify(isProduction ? 'production' : 'development'),
      'process.env.WORKER_VERSION': JSON.stringify(require('./package.json').version),
      'self': 'self' // Define self for shared-worker context
    }),
    new webpack.ProvidePlugin({
      // Provide global variables if needed
      // Promise: ['es6-promise', 'Promise']
    }),
    // Conditional bundle analyzer
    ...(analyzeBundle ? [
      new BundleAnalyzerPlugin({
        analyzerMode: 'static',
        reportFilename: 'shared-worker-bundle-report.html',
        openAnalyzer: false
      })
    ] : [])
  ],
  performance: {
    hints: isProduction ? 'warning' : false,
    maxEntrypointSize: 512000, // 500KB
    maxAssetSize: 512000
  },
  devtool: isProduction ? false : 'source-map',
  stats: {
    colors: true,
    modules: false,
    children: false,
    chunks: false,
    chunkModules: false,
    warnings: true
  }
};
