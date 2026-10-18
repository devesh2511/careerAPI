// Vercel runs this on every deploy (package.json "vercel-build").
// Production deploys apply pending migrations before the new code goes live;
// if one fails, the build fails and Vercel keeps serving the previous
// version, so code never runs against a schema it doesn't expect.
// Preview deploys skip it: they share the production database, and branch
// code must not change its schema.
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`migrations skipped (VERCEL_ENV=${process.env.VERCEL_ENV || 'unset'}; they run on production deploys only)`);
} else if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not available at build time. In Vercel → Settings → Environment Variables, enable it for Production builds.');
  process.exit(1);
} else {
  await import('./migrate.js');
}
