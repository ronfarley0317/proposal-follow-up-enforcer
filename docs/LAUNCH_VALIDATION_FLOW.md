# Recommended Final Pre-Launch Validation Flow

1. `npm install`
2. `npm run migrate`
3. `npm run typecheck`
4. `npm run test:contracts`
5. `npm run test:events`
6. `npm run test:scenarios`
7. `npm run test:failures`
8. `npm run build`
9. Start runtime locally
10. Verify `GET /health`
11. Verify `GET /ready`
12. Send one valid signed request for each major scenario path
13. Restart the process and verify persistence-backed replay still works
14. Deploy to Hostinger VPS
15. Run `/health` and `/ready` in production
16. Run one signed smoke test in production
17. Review logs for redaction and request IDs
18. Complete deployment and signoff checklists
