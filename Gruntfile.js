'use strict';
/*eslint no-sync: 0*/

module.exports = function (grunt) {
    require('load-grunt-tasks')(grunt);

    grunt.config.init({
        clean: {
            options: {
                force: true
            },
            dot: 'true',
            target: {
                src: [
                    'target/**'
                ]
            }
        },
        copy: {
            coverage: {
                files: [
                    {
                        expand: true,
                        src: ['index.js'],
                        dest: 'target/coverage'
                    },
                    {
                        expand: true,
                        src: ['tests/**'],
                        dest: 'target/coverage'
                    }
                ]
            }
        },
        blanket: {
            full: {
                files: {
                    'target/coverage/lib': ['lib/']
                }
            }
        },
        mochaTest: {
            full: {
                options: {
                    timeout: 2000,
                    reporter: 'spec'
                },
                src: ['tests/**/*test.js']
            },
            coverageLCOV: {
                options: {
                    require: 'blanket',
                    reporter: 'mocha-lcov-reporter',
                    quiet: true,
                    captureFile: 'target/coverage/report/coverage.info'
                },
                src: ['./target/coverage/tests/*test.js']
            }
        },
        coveralls: {
            options: {
                force: true
            },
            full: {
                src: 'target/coverage/report/*.info'
            }
        }
    });

    grunt.registerTask('localtest', [
        'mochaTest:full'
    ]);

    grunt.registerTask('test', [
        'clean:target',
        'copy:coverage',
        'blanket:full',
        'mochaTest:coverageLCOV',
        'coveralls:full'
    ]);
};
