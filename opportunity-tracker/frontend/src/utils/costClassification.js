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
    /\baward\b/i,
    /\bscholarship\b/i,
    /\bfellowship\b/i,
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
        return { label: 'Unspecified', tone: 'neutral' };
    }

    // Type-based inference (strong signal)
    const type = opportunity?.type?.toLowerCase() || '';
    if (type.includes('grant') || type.includes('scholarship') || type.includes('fellowship') || type.includes('award')) {
        return { label: 'Reimbursement', tone: 'reimbursement' };
    }

    const isReimbursement = REIMBURSEMENT_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isPaid = PAID_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isFree = FREE_PATTERNS.some((pattern) => pattern.test(combinedText));

    // Reimbursement takes priority (grant/funding should be labeled as such)
    if (isReimbursement && !isFree) return { label: 'Reimbursement', tone: 'reimbursement' };
    
    if (isPaid && !isFree) return { label: 'Paid', tone: 'paid' };
    if (isFree && !isPaid) return { label: 'Free', tone: 'free' };
    if (isPaid && isFree) return { label: 'Mixed', tone: 'neutral' };

    // If no cost language found but type suggests free activity
    if (type.includes('workshop') || type.includes('webinar') || type.includes('competition')) {
        return { label: 'Unspecified', tone: 'neutral' }; // Could be either
    }

    return { label: 'Unspecified', tone: 'neutral' };
}
