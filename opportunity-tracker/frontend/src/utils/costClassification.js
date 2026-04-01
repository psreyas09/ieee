const PAID_PATTERNS = [
    /\bregistration fee\b/i,
    /\bentry fee\b/i,
    /\bparticipation fee\b/i,
    /\bpaid event\b/i,
    /\bfee required\b/i,
    /\btuition\b/i,
    /\bsubscription\b/i,
    /\bpayment required\b/i,
    /\bnon-refundable\b/i,
    /\busd\s?\$?\d+/i,
    /\$\s?\d+/,
    /\beur\s?\$?\d+/i,
    /\binr\s?\$?\d+/i,
    /\bconference fee\b/i,
    /\bconference registration\b/i,
    /\bufee\b/i,
    /\bmembership fee\b/i,
    /\bcourse fee\b/i,
    /\bpay\s+to\s+(attend|participate|enter)/i,
    /\bcost\s+is\s+\$/i,
    /\bprice\s+is\s+\$/i,
    /\bregistration\s+(cost|charge|charges|required)\b/i,
    /\bregistration\s+opens\s+with\s+fee\b/i,
    /\bdues\b/i,
    /\bcharges?\s+apply\b/i,
    /\bpayable\b/i,
    /\bpay\s+upfront\b/i,
    /\bout\s+of\s+pocket\b/i,
    /\byou\s+must\s+pay\b/i,
    /\bbook\s+and\s+pay\b/i,
    /\bproof\s+of\s+registration\b/i,
    /\bregistration\s+at\s+the\s+(full|student)\s+rate\b/i,
];

const FREE_PATTERNS = [
    /\bfree\b/i,
    /\bno fee\b/i,
    /\bno registration fee\b/i,
    /\bwithout fee\b/i,
    /\bfree of charge\b/i,
    /\bcomplimentary\b/i,
    /\bopen access\b/i,
    /\bno cost\b/i,
    /\bfree to attend\b/i,
    /\bat no cost\b/i,
    /\bwaived\b/i,
    /\bwaiver\b/i,
    /\bno charge\b/i,
    /\bfree admission\b/i,
    /\bregistration\s+waiver\b/i,
    /\bfee\s+waiver\b/i,
    /\bwaived\s+registration\b/i,
];

const REIMBURSEMENT_PATTERNS = [
    /\breimburs\w+\b/i,
    /\bgrant\b/i,
    /\bfunding\s+(provided|available|is|support)/i,
    /\bfunding for/i,
    /\bfunded\b/i,
    /\btravel support\b/i,
    /\btravel fund\b/i,
    /\btravel grant\b/i,
    /\btravel funding\b/i,
    /\btravel reimbourse\b/i,
    /\bfinancial assistance\b/i,
    /\bscholarship\b/i,
    /\basset amount\b/i,
    /\bpay.*after\b/i,
    /\bsubmit.*receipt\b/i,
    /\bexpense report\b/i,
    /\bexpenses covered\b/i,
    /\bcover.*expenses\b/i,
    /\bfunding stream\b/i,
    /\baward amount\b/i,
    /\bup to\s+\$([\d,]+)/i,
    /\bup to\s+([a-z]{3})\s+[\d,]+/i,
    /\bmaximum of\s+\$/i,
    /\bconference grant\b/i,
    /\bparticipation award\b/i,
    /\bathlete support\b/i,
    /\bathletic grant\b/i,
    /\bsponsor(ship|ed)?\b/i,
    /\bhotel accommodat/i,
    /\beconomy airfare\b/i,
    /\bflight covered\b/i,
    /\baccommodation provided\b/i,
    /\breimbursement\s+model\b/i,
    /\breimburse\s+later\b/i,
    /\bafter[-\s]?the[-\s]?fact\b/i,
    /\bpay\s+first\s+and\s+get\s+reimbursed\b/i,
    /\bonce\s+travel\s+is\s+completed\b/i,
    /\battendance\s+is\s+verified\b/i,
    /\bsubmit\s+the\s+receipt\s+immediately\b/i,
    /\bearly\s+airfare\s+reimbursement\b/i,
    /\bexpense\s+is\s+reimbursed\b/i,
    /\bpay\s+for\s+your\s+own\s+(economy[-\s]?class\s+)?tickets\b/i,
    /\bvisa\s+fees?\b/i,
    /\blocal\s+transit\b/i,
];

const FELLOWSHIP_FUNDING_PATTERNS = [
    /\bfunded\s+fellowship\b/i,
    /\bpaid\s+fellowship\b/i,
    /\bfellowship\s+(stipend|allowance|grant|funding|support)\b/i,
    /\bstipend\b/i,
    /\bmonthly\s+stipend\b/i,
    /\bhonorarium\b/i,
    /\bresearch\s+allowance\b/i,
];

const MONETARY_AWARD_PATTERNS = [
    /\bcash\s+award\b/i,
    /\bcash\s+prize\b/i,
    /\bmonetary\s+award\b/i,
    /\bprize\s+money\b/i,
    /\bstipend\b/i,
    /\bhonorarium\b/i,
    /\baward\s+amount\b/i,
    /\baward\s+of\s+\$\s?\d+/i,
    /\bup\s+to\s+\$\s?[\d,]+\b/i,
    /\b\$\s?[\d,]+\b/i,
];

export function getCostInfo(opportunity) {
    const combinedText = [
        opportunity?.title,
        opportunity?.description,
        opportunity?.eligibility,
    ]
        .filter(Boolean)
        .join(' ');

    if (!combinedText && !opportunity?.type) {
        return { label: 'Unspecified', tone: 'neutral', category: 'unspecified' };
    }

    // Type-based inference (strong signal)
    const type = opportunity?.type?.toLowerCase() || '';
    if (type.includes('grant') || type.includes('scholarship')) {
        return { label: 'Reimbursement', tone: 'reimbursement', category: 'reimbursement' };
    }

    const isReimbursement = REIMBURSEMENT_PATTERNS.some((pattern) => pattern.test(combinedText));
    const hasMonetaryAwardSignal = MONETARY_AWARD_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isAwardTypeWithMoney = type.includes('award') && hasMonetaryAwardSignal;
    const isFellowshipTypeWithFunding = type.includes('fellowship')
        && FELLOWSHIP_FUNDING_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isPaid = PAID_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isFree = FREE_PATTERNS.some((pattern) => pattern.test(combinedText));

    // Detect membership-gated offers and extract organization acronym
    let memberType = null;
    const membershipPatterns = [
        /(?:for|to)\s+([A-Z]{2,})\s+(?:members|member)/i,  // IEEE SSCS Members → SSCS
        /(?:for|to)\s+(IEEE\s+[A-Z\s]{2,}?)\s+members/i,   // IEEE SSCS Members → IEEE SSCS (first 2-3 words)
        /(?:IEEE\s+)?([A-Z]+)\s+members?\b/i,              // SSCS members → SSCS
    ];
    
    for (const pattern of membershipPatterns) {
        const match = combinedText.match(pattern);
        if (match) {
            memberType = match[1].trim();
            // If it's long, take just acronym
            if (memberType.length > 12) {
                memberType = memberType.split(/\s+/).map(w => w[0]).join('');
            }
            break;
        }
    }

    // Mixed scenarios first so they are not swallowed by single-category checks.
    if (isPaid && isFree) return { label: 'Mixed', tone: 'neutral', category: 'mixed' };
    if (isPaid && (isReimbursement || isAwardTypeWithMoney || isFellowshipTypeWithFunding)) return { label: 'Paid (Reimbursable)', tone: 'paid', category: 'mixed' };
    if (isFree && (isReimbursement || isAwardTypeWithMoney || isFellowshipTypeWithFunding)) return { label: 'Free + Reimbursement', tone: 'reimbursement', category: 'mixed' };

    if (isPaid) return { label: 'Paid', tone: 'paid', category: 'paid' };

    if (isFree) {
        // Add membership condition if detected
        if (memberType && combinedText.toLowerCase().includes('member')) {
            return { label: `Free (${memberType} Members)`, tone: 'free', category: 'free' };
        }
        return { label: 'Free', tone: 'free', category: 'free' };
    }

    if (isReimbursement || isAwardTypeWithMoney || isFellowshipTypeWithFunding) return { label: 'Reimbursement', tone: 'reimbursement', category: 'reimbursement' };

    // If no cost language found but type suggests free activity
    if (type.includes('workshop') || type.includes('webinar') || type.includes('competition')) {
        return { label: 'Unspecified', tone: 'neutral', category: 'unspecified' }; // Could be either
    }

    return { label: 'Unspecified', tone: 'neutral', category: 'unspecified' };
}
