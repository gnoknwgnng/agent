const fs = require('fs');
const path = require('path');

const requiredPaths = [
    path.join(__dirname, '..', 'public', 'index.html'),
    path.join(__dirname, '..', 'public', 'generator.html'),
    path.join(__dirname, '..', 'public', 'publisher.html'),
    path.join(__dirname, '..', 'netlify', 'functions', 'generate.js'),
    path.join(__dirname, '..', 'netlify', 'functions', 'improve-post.js'),
    path.join(__dirname, '..', 'netlify', 'functions', 'publishing-overview.js'),
    path.join(__dirname, '..', 'netlify', 'functions', 'process-queue.js')
];

const missingPaths = requiredPaths.filter((filePath) => !fs.existsSync(filePath));

if (missingPaths.length) {
    console.error('Build validation failed. Missing required files:');
    missingPaths.forEach((filePath) => console.error(`- ${filePath}`));
    process.exit(1);
}

console.log('Build validation passed. Static files and Netlify functions are ready.');
