const fs = require('fs');
const path = require('path');

try {
    const htmlContent = fs.readFileSync('index.html', 'utf8');
    const cssContent = fs.readFileSync('style.css', 'utf8');
    const dbContent = fs.readFileSync('db.js', 'utf8');
    const jsContent = fs.readFileSync('script.js', 'utf8');

    // Replace stylesheet link with inline styles
    let newHtml = htmlContent.replace('<link rel="stylesheet" href="style.css">', `<style>\n${cssContent}\n</style>`);

    // Replace db.js script with inline script
    newHtml = newHtml.replace('<script src="db.js"></script>', `<script>\n${dbContent}\n</script>`);

    // Replace script.js script with inline script
    newHtml = newHtml.replace('<script src="script.js"></script>', `<script>\n${jsContent}\n</script>`);

    fs.writeFileSync('index_android.html', newHtml, 'utf8');
    console.log('Successfully created index_android.html');
} catch (error) {
    console.error('Error creating Android build:', error);
}
