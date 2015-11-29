'use strict';
/*eslint no-sync: 0*/

module.exports = function (grunt) {
    require('time-grunt')(grunt);
    require('load-grunt-tasks')(grunt);

    grunt.config.init({
        mochaTest: {
            full: {
                options: {
                    timeout: 2000,
                    reporter: 'spec'
                },
                src: ['tests/**/*test.js']
            }
        }
    });

    grunt.registerTask('test', [
        'mochaTest:full'
    ]);
};
