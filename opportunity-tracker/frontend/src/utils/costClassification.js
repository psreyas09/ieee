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

    const isPaid = PAID_PATTERNS.some((pattern) => pattern.test(combinedText));
    const isFree = FREE_PATTERNS.some((pattern) => pattern.test(combinedText));

    if (isPaid && !isFree) return { label: 'Paid', tone: 'paid' };
    if (isFree && !isPaid) return { label: 'Free', tone: 'free' };
    if (isPaid && isFree) return { label: 'Mixed', tone: 'neutral' };

    return { label: 'Unspecified', tone: 'neutral' };
}
