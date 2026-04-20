const imapSimple = require('imap-simple');
const { simpleParser } = require('mailparser');

// Gmail IMAP configuration
function getImapConfig() {
    return {
        imap: {
            user: process.env.GMAIL_USER,           //test gmail
            password: process.env.GMAIL_APP_PASSWORD,
            host: 'imap.gmail.com',                 // gmail imap server
            port: 993,                              // gmail imap port
            tls: true,                              // secure connection
            tlsOptions: {
                rejectUnauthorized: false             // avoids SSL errors
            },
            authTimeout: 30000,    // ← increase to 30 seconds
            connTimeout: 30000,    // ← add connection timeout
        }
    };
}

// Main function to get OTP from Gmail
async function getOTPFromGmail(recipientEmail, retries = 10) {

    console.log(`📧 Connecting to Gmail to find OTP for: ${recipientEmail}`);

    // Connect to Gmail
    const connection = await imapSimple.connect(getImapConfig());

    // Open the INBOX folder
    await connection.openBox('INBOX');

    // Wait and retry logic — email might take few seconds to arrive
    for (let attempt = 1; attempt <= retries; attempt++) {

        console.log(`🔄 Attempt ${attempt}/${retries} — searching for OTP email...`);

        // Search for unseen/unread emails
        const searchCriteria = [
            'UNSEEN',           // only unread emails
            ['TO', recipientEmail]  // sent to our test email
        ];

        const fetchOptions = {
            bodies: ['HEADER', 'TEXT', ''],  // fetch full email
            markSeen: true                   // mark as read after fetching
        };

        const messages = await connection.search(searchCriteria, fetchOptions);

        // If email found
        if (messages.length > 0) {

            // Get the latest email
            const latestEmail = messages[messages.length - 1];

            // Get the full email body
            const allParts = latestEmail.parts.filter(part => part.which === '');
            const rawEmail = allParts[0].body;

            // Parse the email to readable text
            const parsed = await simpleParser(rawEmail);

            // Get plain text body of email
            const emailBody = parsed.text || parsed.html || '';
            console.log('📨 Email body received:', emailBody);

            // Extract 6-digit OTP using regex
            const otpMatch = emailBody.match(/\b\d{6}\b/);

            if (otpMatch) {
                const otp = otpMatch[0];
                console.log(`✅ OTP found: ${otp}`);
                connection.end(); // close connection
                return otp;
            }
        }

        // Email not arrived yet — wait 3 seconds before retrying
        console.log(`⏳ Email not found yet, waiting 3 seconds...`);
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // If OTP not found after all retries
    connection.end();
    throw new Error('❌ OTP email not received within timeout period');
}

module.exports = { getOTPFromGmail };