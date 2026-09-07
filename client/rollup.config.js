import { babel } from '@rollup/plugin-babel';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import copy from 'rollup-plugin-copy';

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/app.js',
    format: 'iife',
    sourcemap: false,
  },
  plugins: [
    nodeResolve(),
    babel({ babelHelpers: 'bundled' }),
    copy({
      targets: [
        { src: 'static/*', dest: 'dist' },
      ],
    }),
  ],
};
