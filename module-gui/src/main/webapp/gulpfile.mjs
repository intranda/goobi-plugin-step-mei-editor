import gulp from 'gulp';
const { src, dest, parallel, } = gulp;

import * as rollup from 'rollup';
import terser from '@rollup/plugin-terser';
import cleanup from 'rollup-plugin-cleanup';
import nodeResolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';

import * as dartSass from 'sass';
import gulpSass from 'gulp-sass';
const sass = gulpSass(dartSass);
import sourcemaps from 'gulp-sourcemaps';
import rename from 'gulp-rename';

const sources = {
    css: 'css/mei-editor.scss',
    meiEditor: 'js/src/mei-editor.js',
    verovio: 'js/src/verovio.js',
}

const targets = {
    js: 'resources/MEIEditor/js/',
    css: 'resources/MEIEditor/css/',
}

const meiEditor = () => {
    return rollup
        .rollup({
            input: sources.meiEditor,
            plugins: [
                nodeResolve({
                    browser: true,
                    preferBuiltins: false,
                }),
                commonjs({
                    include: ['node_modules/**'],
                }),
                cleanup(),
            ],
        })
        .then(bundle => {
            return bundle.write({
                file: `${targets.js}mei-editor.js`,
                format: 'iife',
                sourcemap: true,
                plugins: [
                    terser({
                        mangle: true,
                    }),
                ]
            });
        });
};

const verovio = () => {
    return rollup
        .rollup({
            input: sources.verovio,
            plugins: [
                nodeResolve({
                    browser: true,
                    preferBuiltins: false,
                    exportConditions: ['import', 'module', 'browser', 'default']
                }),
                commonjs({
                    include: ['node_modules/**'],
                    ignoreDynamicRequires: true
                }),
                cleanup(),
            ],
        })
        .then(bundle => {
            return bundle.write({
                file: `${targets.js}verovio.js`,
                format: 'iife',
                sourcemap: true,
                plugins: [
                    terser({
                        mangle: true,
                    }),
                ]
            });
        });
};

const css = () => {
    return src(sources.css)
        .pipe(sourcemaps.init())
        .pipe(sass({outputStyle: 'compressed'}).on('error', sass.logError))
        .pipe(sourcemaps.write('.'))
        .pipe(rename((path) => {
            basename: path.basename += '.min'
        }))
        .pipe(dest(targets.css));
};

const prod = parallel(meiEditor, verovio, css);

export { prod };