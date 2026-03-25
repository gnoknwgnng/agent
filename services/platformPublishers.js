const axios = require('axios');

async function publishLinkedIn(account, queueItem) {
    if (!account.accessToken || !account.authorUrn) {
        throw new Error('LinkedIn publishing requires accessToken and authorUrn.');
    }

    const payload = {
        author: account.authorUrn,
        lifecycleState: 'PUBLISHED',
        specificContent: {
            'com.linkedin.ugc.ShareContent': {
                shareCommentary: {
                    text: queueItem.content
                },
                shareMediaCategory: 'NONE'
            }
        },
        visibility: {
            'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC'
        }
    };

    const response = await axios.post('https://api.linkedin.com/v2/ugcPosts', payload, {
        headers: {
            Authorization: `Bearer ${account.accessToken}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0'
        }
    });

    return {
        providerId: response.headers['x-restli-id'] || response.data?.id || null,
        providerResponse: response.data || null
    };
}

async function publishToPlatform(platform, account, queueItem) {
    if (platform !== 'linkedin') {
        throw new Error(`Unsupported platform: ${platform}. Only linkedin is enabled.`);
    }

    return publishLinkedIn(account, queueItem);
}

module.exports = {
    publishToPlatform
};
