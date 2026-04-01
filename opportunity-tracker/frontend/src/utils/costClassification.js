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
    /\busd\s?\d+/i,
    /\$\s?\d+/,
    /\beur\s?\d+/i,
    /\binr\s?\d+/i,
];

const FREE_PATTERNS = [
    /\bfree\b/i,
    /\bno fee\b/i,
    /\bno registration fee\b/i,
    /\bwithout fee\b/i,
    /\bfree of charge\b/i,
    /\bcomplimentary\b/i,
    /\bopen access\b/i,
];

const REIMBURSEMENT_PATTERNS = [
    /\breimburs\w+\b/i,
    /\bgrant\b/i,
    /\bfunding\b/i,
    /\btravel support\b/i,
    /\btravel fund\b/i,
    /\btravel grant\b/i,
    /\bfinancial assistance\b/i,
    /\baward\b/i,
    /\bscholarship\b/i,
    /\bfellowship\b/i,
    /\basset amount\b/i,
    /\bpay.*after\b/i,
    /\bsubmit.*receipt\b/i,
    /\bexpense report\b/i,
];

export function getCostInfo(opportunity) {
    const combinedText = [
        opportunity?.title,
        opportunity?.description,
        opportunity?.eligibility,
    ]
        .filter(Boolean)
        .join(' ');

    if (!combinedText) {
        return { label: 'Unspecified', tone: 'neutral' };
    }

    const isReimbursement = REIMBURSEMENT_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isPaid = PAID_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isFree = FREE_PATTERNS.some((pattern) => pattern.test(combinedText));

    // Reimbursement takes priority (grant/funding should be labeled as such)
    if (isReimbursement && !isFree) return { label: 'Reimbursement', tone: 'reimbursement' };
    
    if (isPaid && !isFree) return { label: 'Paid', tone: 'paid' };
    if (isFree && !isPaid) return { label: 'Free', tone: 'free' };
    if (isPaid && isFree) return { label: 'Mixed', tone: 'neutral' };

    return { label: 'Unspecified', tone: 'neutral' };
}
