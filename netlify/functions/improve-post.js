const LinkedInPostGenerator = require('../../linkedinPostGenerator');

exports.handler = async (event, context) => {
    // Set CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    };

    // Handle preflight requests
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    if (event.httpMethod !== 'POST') {
        return {
            statusCode: 405,
            headers,
            body: JSON.stringify({ error: 'Method not allowed' })
        };
    }

    try {
        const {
            currentPost,
            userRequest,
            postType,
            holiday,
            postTypeCategory,
            companyInfo
        } = JSON.parse(event.body);

        // Validate required fields
        if (!currentPost || !userRequest) {
            return {
                statusCode: 400,
                headers,
                body: JSON.stringify({ 
                    error: 'currentPost and userRequest are required' 
                })
            };
        }

        // Initialize generator
        const generator = new LinkedInPostGenerator();
        generator.setPlatform('linkedin');
        const platformName = generator.getPlatformConfig().name;

        // Create improvement prompt
        const improvementPrompt = `You are a professional ${platformName} content expert. A user wants to improve their ${platformName} post.

Current Post:
"${currentPost}"

Post Context:
- Type: ${postType} ${holiday ? `(Holiday: ${holiday})` : `(Category: ${postTypeCategory})`}
- Company: ${companyInfo?.name || 'Unknown'}
- Industry: ${companyInfo?.industry || 'Business'}

User Request: "${userRequest}"

Please provide:
1. A brief explanation of what you'll improve (2-3 sentences)
2. An improved version of the post that addresses their request

Keep the improved post professional, engaging, and suitable for ${platformName}. Maintain the original structure and key information while implementing the requested changes.

Format your response as:
EXPLANATION: [Your explanation here]
IMPROVED_POST: [The improved post here]`;

        // Generate improvement using AI
        const aiResponse = await generator.generateContentWithAI(improvementPrompt);

        if (aiResponse) {
            // Parse the AI response
            const explanationMatch = aiResponse.match(/EXPLANATION:\s*(.*?)(?=IMPROVED_POST:|$)/s);
            const improvedPostMatch = aiResponse.match(/IMPROVED_POST:\s*(.*)/s);

            const explanation = explanationMatch ? explanationMatch[1].trim() : "I've improved your post based on your request.";
            const improvedPost = improvedPostMatch ? improvedPostMatch[1].trim() : aiResponse;

            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    success: true,
                    explanation: explanation,
                    improvedPost: improvedPost,
                    originalPost: currentPost
                })
            };
        } else {
            throw new Error('AI service unavailable');
        }
    } catch (error) {
        console.error('Error improving post:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                success: false,
                error: 'Failed to improve post',
                details: error.message 
            })
        };
    }
};
