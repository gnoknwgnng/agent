const LinkedInPostGenerator = require('./linkedinPostGenerator');

async function example() {
    // Create generator instance
    const generator = new LinkedInPostGenerator();
    
    // Set company information
    await generator.setCompanyInfo(
        'AP&A SYSTEM LLP',
        'https://www.apasystemllp.com/services',
        [
            'IT Solutions for digital transformation',
            'HR & Recruitment for building strong teams', 
            'Branding & Marketing for powerful presence',
            'Social Media Management for meaningful connections'
        ],
        'Technology'
    );
    
    // Generate calendar for October 2025
    console.log('Generating AI-powered LinkedIn post calendar with Groq...\n');
    
    const calendar = await generator.generateCalendar('2025-10-01', '2025-10-05', 'US');
    
    // Display results
    calendar.forEach((item, index) => {
        console.log(`\n=== POST ${index + 1} ===`);
        console.log(`Date: ${item.date}`);
        console.log(`Type: ${item.type}`);
        if (item.holiday) {
            console.log(`Holiday: ${item.holiday}`);
        }
        console.log('\nPost Content:');
        console.log(item.post);
        console.log('\n' + '='.repeat(80));
    });
    
    console.log(`\nGenerated ${calendar.length} posts for the date range.`);
}

// Run example
if (require.main === module) {
    example().catch(console.error);
}

module.exports = example;