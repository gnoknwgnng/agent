const axios = require('axios');
const { Groq } = require('groq-sdk');
require('dotenv').config();

class LinkedInPostGenerator {
    constructor() {
        this.baseUrl = 'https://date.nager.at/api/v3';
        this.groq = new Groq({
            apiKey: process.env.GROQ_API_KEY
        });
        this.companyInfo = {};

        // Model priority list - best models first
        this.models = [
            'meta-llama/llama-4-maverick-17b-128e-instruct', // Latest Llama 4
            'llama-3.3-70b-versatile', // Large versatile model
            'qwen/qwen3-32b', // Qwen 3 32B
            'deepseek-r1-distill-llama-70b', // DeepSeek R1
            'openai/gpt-oss-120b', // Large OpenAI model
            'openai/gpt-oss-20b', // Medium OpenAI model
            'moonshotai/kimi-k2-instruct', // Moonshot AI
            'llama-3.1-8b-instant', // Fast Llama model
            'groq/compound', // Groq compound model
            'gemma2-9b-it', // Google Gemma
            'groq/compound-mini' // Fallback mini model
        ];

        this.currentModelIndex = 0;
        this.modelFailures = new Map(); // Track failures per model
        this.platform = 'linkedin';
    }

    setPlatform(platform = 'linkedin') {
        const normalizedPlatform = String(platform || 'linkedin').toLowerCase();
        const supportedPlatforms = ['linkedin'];
        this.platform = supportedPlatforms.includes(normalizedPlatform) ? normalizedPlatform : 'linkedin';
    }

    getPlatformConfig() {
        const configs = {
            linkedin: {
                name: 'LinkedIn',
                audienceLabel: 'professional LinkedIn audience',
                systemStyle: 'professional, insightful, and polished',
                hashtagGuidance: 'include relevant hashtags naturally',
                lengthGuidance: 'Keep each post within 300 words.',
                maxWords: 300,
                titles: {
                    service: 'SERVICE SPOTLIGHT',
                    tip: 'BUSINESS TIP',
                    motivation: 'MOTIVATION MONDAY',
                    motivationAlt: 'MIDWEEK MOTIVATION',
                    ai_tool: 'AI TOOL SPOTLIGHT'
                }
            }
        };

        return configs[this.platform] || configs.linkedin;
    }

    async setCompanyInfo(companyName, website, services, industry) {
        // Auto-generate hashtags
        const hashtags = await this.generateHashtags(companyName, services, industry);

        this.companyInfo = {
            name: companyName,
            website: website,
            services: services,
            industry: industry,
            hashtags: hashtags
        };
    }

    async getHolidays(year, countryCode = 'US') {
        try {
            const url = `${this.baseUrl}/PublicHolidays/${year}/${countryCode}`;
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            console.error('Error fetching holidays:', error.message);
            return [];
        }
    }

    getDateRange(startDate, endDate) {
        const dates = [];
        const start = new Date(startDate);
        const end = new Date(endDate);

        const current = new Date(start);
        while (current <= end) {
            dates.push(new Date(current));
            current.setDate(current.getDate() + 1);
        }

        return dates;
    }

    findHolidayForDate(date, holidays) {
        const dateStr = date.toISOString().split('T')[0];
        return holidays.find(holiday => holiday.date === dateStr) || null;
    }

    getCurrentModel() {
        return this.models[this.currentModelIndex];
    }

    switchToNextModel() {
        const currentModel = this.getCurrentModel();
        this.modelFailures.set(currentModel, (this.modelFailures.get(currentModel) || 0) + 1);

        this.currentModelIndex = (this.currentModelIndex + 1) % this.models.length;
        const nextModel = this.getCurrentModel();

        console.log(`🔄 Switching from ${currentModel} to ${nextModel}`);
        return nextModel;
    }

    async generateContentWithAI(prompt) {
        const platformConfig = this.getPlatformConfig();
        const systemPrompt = `You are a professional ${platformConfig.name} content creator. Generate ${platformConfig.systemStyle} posts for a ${platformConfig.audienceLabel}. Keep posts concise, use emojis appropriately, ${platformConfig.hashtagGuidance}, and follow this length rule: ${platformConfig.lengthGuidance}`;
        const currentModel = this.getCurrentModel();

        try {
            console.log(`🤖 Generating content with ${currentModel}...`);

            const chatCompletion = await this.groq.chat.completions.create({
                messages: [
                    {
                        role: 'system',
                        content: systemPrompt
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                model: currentModel,
                temperature: 0.8,
                max_tokens: 600,
                top_p: 1,
                stream: false
            });

            const generatedContent = chatCompletion.choices[0]?.message?.content?.trim();

            if (generatedContent) {
                console.log(`✅ Success with ${currentModel}:`, generatedContent.substring(0, 100) + '...');
                return generatedContent;
            }

        } catch (error) {
            console.error(`❌ Error with ${currentModel}:`, error.message);

            // Handle rate limits and other errors - this will cause model switch for the entire calendar
            if (error.status === 429 || error.message.includes('rate limit') || error.message.includes('quota')) {
                console.log(`⚠️ Rate limit hit for ${currentModel}, will switch to next model for remaining posts`);
                throw new Error(`RATE_LIMIT:${currentModel}`);
            } else if (error.status === 400 || error.message.includes('model')) {
                console.log(`⚠️ Model error for ${currentModel}, will switch to next model for remaining posts`);
                throw new Error(`MODEL_ERROR:${currentModel}`);
            } else {
                console.log(`⚠️ Unknown error for ${currentModel}, will switch to next model for remaining posts`);
                throw new Error(`UNKNOWN_ERROR:${currentModel}`);
            }
        }

        return null;
    }



    getModelStatus() {
        return {
            currentModel: this.getCurrentModel(),
            currentIndex: this.currentModelIndex,
            totalModels: this.models.length,
            failures: Object.fromEntries(this.modelFailures),
            availableModels: this.models
        };
    }

    resetModelFailures() {
        this.modelFailures.clear();
        this.currentModelIndex = 0;
        console.log('🔄 Reset model failures, starting with best model again');
    }

    async generateHashtags(companyName, services, industry) {
        try {
            const platformConfig = this.getPlatformConfig();
            // Ensure services is an array
            const servicesArray = Array.isArray(services) ? services : (services ? [services] : []);
            
            const prompt = `Generate 6-10 relevant hashtags for a ${platformConfig.name} post about:
Company: ${companyName}
Services: ${servicesArray.join(', ') || ''}
Industry: ${industry || 'Business'}

Requirements:
- Mix of industry-specific and general business hashtags
- Include company branding hashtags
- Match ${platformConfig.name} style and discoverability
- Return only hashtags separated by spaces, no explanations`;

            const response = await this.generateContentWithAI(prompt);

            if (response) {
                // Extract hashtags from response
                const hashtags = response.match(/#\w+/g) || [];
                return hashtags.map(tag => tag.replace('#', ''));
            }

            // Fallback hashtags
            return ['Business', 'Innovation', 'Growth', 'Success', 'Leadership', 'Technology', 'Professional', 'Networking'];
        } catch (error) {
            console.error('Error generating hashtags:', error.message);
            return ['Business', 'Innovation', 'Growth', 'Success'];
        }
    }
    formatDate(date) {
        const options = {
            year: 'numeric',
            month: 'long',
            day: '2-digit',
            weekday: 'long'
        };
        const formatted = date.toLocaleDateString('en-US', options);
        const parts = formatted.split(', ');
        const weekday = parts[0];
        const monthDay = parts[1];
        const year = parts[2];

        return {
            full: `${monthDay}, ${year}`,
            weekday: weekday
        };
    }

    async generateFestivalPost(date, holiday) {
        const platformConfig = this.getPlatformConfig();
        const dateFormatted = this.formatDate(date);

        // Try AI generation first
        const aiPrompt = `Create a ${platformConfig.systemStyle} ${platformConfig.name} post for ${holiday.name} on ${dateFormatted.full} (${dateFormatted.weekday}). 

Company: ${this.companyInfo.name || 'Our Company'}
Website: ${this.companyInfo.website || ''}
Services: ${Array.isArray(this.companyInfo.services) ? this.companyInfo.services.join(', ') : (this.companyInfo.services || '')}
Industry: ${this.companyInfo.industry || ''}
Hashtags to include: ${this.companyInfo.hashtags?.map(tag => `#${tag}`).join(' ') || ''}

Requirements:
- Start with the date format: 📅 ${dateFormatted.full} (${dateFormatted.weekday}) - FESTIVAL POST
- Include appropriate emojis for ${holiday.name}
- Connect the holiday theme to business values
- Mention company services naturally
- Include the website link
- End with relevant hashtags including #${holiday.name.replace(/\s+/g, '')}
- Match the tone users expect on ${platformConfig.name}
- Maximum ${platformConfig.maxWords} words`;

        const aiContent = await this.generateContentWithAI(aiPrompt);

        if (aiContent) {
            return aiContent;
        }

        // Fallback to template-based generation
        const festivalEmojis = {
            'new year': '🎉',
            'christmas': '🎄',
            'easter': '🐰',
            'independence': '🇺🇸',
            'labour': '⚒️',
            'labor': '⚒️',
            'mother': '👩‍👧‍👦',
            'father': '👨‍👧‍👦',
            'valentine': '💝',
            'halloween': '🎃',
            'thanksgiving': '🦃',
            'memorial': '🇺🇸',
            'veterans': '🇺🇸',
            'martin luther king': '✊',
            'presidents': '🇺🇸',
            'columbus': '🌎',
            'flag': '🇺🇸'
        };

        let emoji = '🌟';
        const holidayName = holiday.name.toLowerCase();
        for (const [key, value] of Object.entries(festivalEmojis)) {
            if (holidayName.includes(key)) {
                emoji = value;
                break;
            }
        }

        const serviceList = this.companyInfo.services || [];
        const servicesText = serviceList.map(service => `🔧 ${service}`).join('\n') || '';
        const hashtagsText = this.companyInfo.hashtags?.map(tag => `#${tag}`).join(' ') || '';

        const post = `📅 ${dateFormatted.full} (${dateFormatted.weekday}) - FESTIVAL POST

${emoji} Happy ${holiday.name}! ${emoji}

Celebrating this special day with gratitude and joy.

At ${this.companyInfo.name || 'Our Company'}, we believe in celebrating milestones and traditions that bring us together:

${servicesText}

May this ${holiday.name} bring prosperity and success to all!

Visit: ${this.companyInfo.website || ''}

#${holiday.name.replace(/\s+/g, '')} ${hashtagsText}`;

        return post;
    }

    async generateBusinessPost(date, postType = 'service') {
        const platformConfig = this.getPlatformConfig();
        const dateFormatted = this.formatDate(date);

        const businessPostTemplates = {
            service: {
                emoji: '💼',
                title: platformConfig.titles.service,
                theme: 'highlighting company services and solutions'
            },
            tip: {
                emoji: '💡',
                title: platformConfig.titles.tip,
                theme: 'sharing valuable business insights and tips'
            },
            motivation: {
                emoji: '🚀',
                title: dateFormatted.weekday === 'Monday' ? platformConfig.titles.motivation : platformConfig.titles.motivationAlt,
                theme: 'motivational content about business growth and success'
            },
            ai_tool: {
                emoji: '🤖',
                title: platformConfig.titles.ai_tool,
                theme: 'featuring AI tools and technology innovations'
            }
        };

        const template = businessPostTemplates[postType] || businessPostTemplates.service;

        // Try AI generation first
        const aiPrompt = `Create a ${platformConfig.systemStyle} ${platformConfig.name} post for ${dateFormatted.full} (${dateFormatted.weekday}) focused on ${template.theme}.

Company: ${this.companyInfo.name || 'Our Company'}
Website: ${this.companyInfo.website || ''}
Services: ${Array.isArray(this.companyInfo.services) ? this.companyInfo.services.join(', ') : (this.companyInfo.services || '')}
Industry: ${this.companyInfo.industry || ''}
Hashtags to include: ${this.companyInfo.hashtags?.map(tag => `#${tag}`).join(' ') || ''}

Requirements:
- Start with the date format: 📅 ${dateFormatted.full} (${dateFormatted.weekday}) - ${template.title}
- Use the emoji: ${template.emoji}
- Focus on ${template.theme}
- Naturally incorporate company services
- Include a call-to-action
- Include the website link
- End with relevant hashtags
- Match the tone users expect on ${platformConfig.name}
- Maximum ${platformConfig.maxWords} words`;

        const aiContent = await this.generateContentWithAI(aiPrompt);

        if (aiContent) {
            return aiContent;
        }

        // Fallback to template-based generation
        const fallbackContent = {
            service: `Highlighting our comprehensive business solutions today!\n\nAt ${this.companyInfo.name || 'Our Company'}, we provide:`,
            tip: `Today's business insight from ${this.companyInfo.name || 'Our Company'}:\n\nSuccess comes from consistent effort and strategic planning.`,
            motivation: `Starting strong this ${dateFormatted.weekday}!\n\n${this.companyInfo.name || 'Our Company'} believes in empowering businesses through:`,
            ai_tool: `Discovered an incredible AI tool transforming business operations!\n\nThis aligns with our solutions at ${this.companyInfo.name || 'Our Company'}, helping businesses:`
        };

        const serviceList = this.companyInfo.services || [];
        const servicesText = serviceList.map(service => `✨ ${service}`).join('\n') || '';
        const hashtagsText = this.companyInfo.hashtags?.map(tag => `#${tag}`).join(' ') || '';

        const post = `📅 ${dateFormatted.full} (${dateFormatted.weekday}) - ${template.title}

${template.emoji} ${fallbackContent[postType]}

${servicesText}

Ready to elevate your business? Let's connect and explore opportunities!

Visit: ${this.companyInfo.website || ''}

${hashtagsText}`;

        return post;
    }

    async generateCalendar(startDate, endDate, countryCode = 'US') {
        const dates = this.getDateRange(startDate, endDate);
        const year = new Date(startDate).getFullYear();
        const holidays = await this.getHolidays(year, countryCode);

        const calendar = [];
        const postTypes = ['service', 'tip', 'motivation', 'ai_tool'];
        let postTypeIndex = 0;
        let currentModel = this.getCurrentModel();

        console.log(`📅 Starting calendar generation with ${dates.length} posts using model: ${currentModel}`);

        for (let i = 0; i < dates.length; i++) {
            const date = dates[i];
            const holiday = this.findHolidayForDate(date, holidays);
            let post = null;
            let retryWithNewModel = false;

            try {
                if (holiday) {
                    // Generate festival post
                    post = await this.generateFestivalPost(date, holiday);
                    calendar.push({
                        date: date.toISOString().split('T')[0],
                        type: 'festival',
                        holiday: holiday.name,
                        post: post,
                        model: currentModel
                    });
                } else {
                    // Generate business post
                    const postType = postTypes[postTypeIndex % postTypes.length];
                    post = await this.generateBusinessPost(date, postType);
                    calendar.push({
                        date: date.toISOString().split('T')[0],
                        type: 'business',
                        postType: postType,
                        post: post,
                        model: currentModel
                    });
                    postTypeIndex++;
                }
            } catch (error) {
                // Model failed, switch to next model for remaining posts
                if (error.message.includes('RATE_LIMIT') || error.message.includes('MODEL_ERROR') || error.message.includes('UNKNOWN_ERROR')) {
                    console.log(`🔄 Model ${currentModel} failed, switching to next model for remaining ${dates.length - i} posts`);
                    this.switchToNextModel();
                    currentModel = this.getCurrentModel();
                    console.log(`📅 Continuing with model: ${currentModel}`);

                    // Retry this post with the new model
                    try {
                        if (holiday) {
                            post = await this.generateFestivalPost(date, holiday);
                            calendar.push({
                                date: date.toISOString().split('T')[0],
                                type: 'festival',
                                holiday: holiday.name,
                                post: post,
                                model: currentModel
                            });
                        } else {
                            const postType = postTypes[postTypeIndex % postTypes.length];
                            post = await this.generateBusinessPost(date, postType);
                            calendar.push({
                                date: date.toISOString().split('T')[0],
                                type: 'business',
                                postType: postType,
                                post: post,
                                model: currentModel
                            });
                            postTypeIndex++;
                        }
                    } catch (retryError) {
                        console.log(`❌ New model ${currentModel} also failed, using template for this post`);
                        // Use template-based generation as final fallback
                        if (holiday) {
                            post = await this.generateFestivalPost(date, holiday); // This will use template fallback
                        } else {
                            const postType = postTypes[postTypeIndex % postTypes.length];
                            post = await this.generateBusinessPost(date, postType); // This will use template fallback
                            postTypeIndex++;
                        }
                        calendar.push({
                            date: date.toISOString().split('T')[0],
                            type: holiday ? 'festival' : 'business',
                            holiday: holiday?.name,
                            postType: holiday ? undefined : postTypes[(postTypeIndex - 1) % postTypes.length],
                            post: post,
                            model: 'template-fallback'
                        });
                    }
                } else {
                    throw error; // Re-throw if it's not a model-related error
                }
            }
        }

        console.log(`✅ Calendar generation completed. Generated ${calendar.length} posts.`);
        return calendar;
    }

    // Helper method to get available countries
    async getAvailableCountries() {
        try {
            const url = `${this.baseUrl}/AvailableCountries`;
            const response = await axios.get(url);
            return response.data;
        } catch (error) {
            console.error('Error fetching countries:', error.message);
            return [];
        }
    }

    // Export calendar to JSON
    exportToJSON(calendar) {
        return JSON.stringify(calendar, null, 2);
    }

    // Export calendar to text format
    exportToText(calendar) {
        return calendar.map(item => {
            return `${item.date} (${item.type.toUpperCase()})\n${'-'.repeat(50)}\n${item.post}\n\n`;
        }).join('');
    }
}

module.exports = LinkedInPostGenerator;
