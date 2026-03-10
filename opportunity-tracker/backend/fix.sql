UPDATE "Opportunity" SET status = 'Closed' WHERE deadline < NOW() AND status != 'Closed';
