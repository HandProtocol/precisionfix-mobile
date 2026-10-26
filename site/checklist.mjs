// The owner's Setup checklist, shown as the Setup tab in /admin/. Written
// for a phone first (the owner has Claude Code on his phone and no computer).
// Every step is a button (actions); steps tick themselves where the site
// can tell (check); ticks save on the spot. Item shape and the action/check
// kinds: netlify/functions/lib/checklist.mjs.
//
// Inline marks: **bold**, `code`. Keep steps short and literal.

export const SITE = 'PrecisionFix';
export const DOMAIN = 'precisionfixmobile.com';
export const REPO = 'precisionfix-site';
export const OLD_SITE = 'https://percesionfix.netlify.app';

export const CHECKLIST = [
  {
    id: 'theme',
    title: 'Pick the look of your site',
    embed: 'looks',
    why: 'The site ships with five complete looks. Tap one to see your real site in it. Tap **Use this look** and it is live. Change your mind any time.',
    done: 'The site opens in the look you chose.',
  },
  {
    id: 'copy',
    title: 'Read every line, and check your phone number',
    why: 'Everything on the page is yours to change, in English and Spanish. The phone number is the one thing that must be exactly right before the site goes on your domain.',
    actions: [
      { label: 'Check the phone number', kind: 'field', target: 'contact.phone' },
      { label: 'Add your email', kind: 'field', target: 'contact.email' },
      { label: 'Read the live site', kind: 'site', target: '/' },
    ],
    check: { kind: 'field', path: 'contact.email' },
    phone: [
      'Tap **Check the phone number** and confirm it digit by digit.',
      'Tap **Add your email**: that is where booking requests are sent.',
      'Scroll the Content tab section by section: every English field has a Spanish twin (marked ES). Fix anything that sounds off, then tap **Publish changes**.',
      'Tap **Read the live site** and read it on your phone in both languages (the EN / ES switch is at the top).',
    ],
    done: 'Your email is in, the number dials you, and you have read the live site in both languages.',
  },
  {
    id: 'photos',
    title: 'Add your own photos',
    why: 'The five photos from your old site are already in. Real cars you worked on beat stock photos every time, and the featured photo is the picture people see when your link is shared.',
    actions: [{ label: 'Open Media', kind: 'tab', target: 'media' }],
    phone: [
      'Tap **Open Media**, then **Add photos**. Pick straight from your camera roll; big files are fine, they are resized on your phone.',
      'Tap **Set featured** on your best photo: it is the picture that shows when your link is shared in a text, on Facebook or on Google.',
      'Use the arrows to put them in order. Each photo can carry a caption (the car and what you did).',
      'Tap **Replace** on any photo to swap it without losing its spot.',
    ],
    done: 'The gallery shows your photos with captions.',
  },
  {
    id: 'hours',
    title: 'Set your hours and days off',
    why: 'Customers pick a day and a time window from these hours. Days without a row are closed; a day off blocks the whole day.',
    actions: [
      { label: 'Set my hours', kind: 'field', target: 'calendar.hours' },
      { label: 'Add a day off', kind: 'field', target: 'calendar.blackouts' },
    ],
    phone: [
      'Tap **Set my hours**: one row per working day, with a from and a to. Remove the days you do not work.',
      'Scroll down the same section: the time windows customers choose from (Morning, Midday, Afternoon), how much notice you need, and how far ahead people can book.',
      'Tap **Publish changes**.',
    ],
    done: 'Your real hours are in and the booking form only offers days you work.',
  },
  {
    id: 'booking_test',
    title: 'Send yourself a test booking',
    why: 'Requests land in the Bookings tab and email you with one-tap Confirm and Decline links. Prove the whole loop works before a real customer finds it.',
    actions: [
      { label: 'Open the booking form', kind: 'site', target: '#book' },
      { label: 'Open Bookings', kind: 'tab', target: 'bookings' },
    ],
    check: { kind: 'booking' },
    phone: [
      'Tap **Open the booking form**, pick a service, a day and a time, and fill it with your own details and email.',
      'Tap **Request this time**. You should see the thank-you message with your request summary.',
      'Within a minute, check your inbox: one email titled **Booking request: <your name>** with **Confirm** and **Decline** buttons, and one "got your request" email addressed to you as the customer.',
      'Tap **Confirm** in the email, or tap **Open Bookings** and confirm it there. The customer copy of you gets a confirmation with a calendar file.',
    ],
    ask: 'If nothing arrives within five minutes, tell HAND. We will check the mail logs.',
    done: 'Your test request shows under Confirmed in the Bookings tab and both emails arrived.',
  },
  {
    id: 'calendar_phone',
    title: 'Put your bookings on your phone\'s calendar',
    why: 'Every confirmed job also lives in a calendar feed. Subscribe once and new jobs appear on your phone by themselves; each confirmation email carries the job as a calendar file too.',
    actions: [{ label: 'Open Bookings', kind: 'tab', target: 'bookings' }],
    phone: [
      'Tap **Open Bookings**, then **Add to my phone\'s calendar** at the top.',
      'Your phone asks to subscribe to a calendar. Say yes. On iPhone it may take a few minutes to refresh; that is normal.',
    ],
    done: 'A confirmed job shows up in your phone\'s calendar app.',
  },
  {
    id: 'github',
    title: 'Create your GitHub account',
    why: 'Your site\'s code lives in a GitHub repository. That is what Claude Code on your phone edits, and every change you approve goes live.',
    actions: [{ label: 'Sign up at GitHub', kind: 'url', target: 'https://github.com/signup' }],
    phone: [
      'Tap **Sign up at GitHub** (the free plan is all you need).',
      'Pick a username you are happy to keep, confirm your email, and skip anything optional.',
      'Send HAND your GitHub username.',
      'HAND adds you to the site\'s repository, `' + REPO + '`. You will get an invitation email: open it and tap **Accept invitation**.',
    ],
    ask: 'Send us the email you want to use and we will walk you through it on a call.',
    done: 'You can open the `' + REPO + '` repository on github.com and see the site\'s files.',
  },
  {
    id: 'claude_code',
    title: 'Connect Claude Code to the site',
    why: 'Once Claude Code can see the repository you can change anything about the site by describing it, from your phone, without touching code.',
    actions: [{ label: 'Open Claude Code', kind: 'url', target: 'https://claude.ai/code' }],
    phone: [
      'Tap **Open Claude Code**, then **Connect GitHub**, and choose the `' + REPO + '` repository when it asks which repositories it may access.',
      'Start a session on that repository and try something small, for example: "Make the services section show two columns on desktop".',
      'Claude opens a pull request. Open it in the GitHub app or github.com and tap **Merge**. HAND puts it live.',
    ],
    ask: 'HAND can make any change for you the same way. Just describe it.',
    done: 'You have merged one change and seen it live on the site.',
  },
  {
    id: 'supabase',
    title: 'Create your Supabase account',
    why: 'Everything you edit here (your text, your photos, your publish history) lives in a database. Today HAND hosts it inside a shared project. With your own free Supabase account, HAND can move your data into a project that belongs to you, so the whole site is yours to keep.',
    actions: [{ label: 'Sign up at Supabase', kind: 'url', target: 'https://supabase.com/dashboard/sign-up' }],
    phone: [
      'Tap **Sign up at Supabase** (the free plan is all you need).',
      'Sign up with the GitHub account from the step above (fastest), or with the same email you use for this editor.',
      'When it asks for an organization, name it **PrecisionFix** and keep the free plan.',
      'Send HAND the email you signed up with. Nothing to build on your side; HAND sets the project up and adds you as its owner.',
    ],
    ask: 'HAND can walk you through it on a call, or create it with you and hand over the keys.',
    done: 'You can sign in at supabase.com/dashboard and see the PrecisionFix organization.',
  },
  {
    id: 'domain',
    title: 'Point ' + DOMAIN + ' at the new site',
    why: 'You already own the domain on Namecheap. Right now it points nowhere. Two settings on Namecheap send it to this site with HTTPS handled automatically.',
    actions: [{ label: 'Open Namecheap', kind: 'url', target: 'https://ap.www.namecheap.com/domains/list/' }],
    check: { kind: 'host' },
    phone: [
      'HAND sends you **four nameserver addresses** (they look like `dns1.p03.nsone.net`). Have them ready.',
      'Tap **Open Namecheap**, sign in, and tap **Manage** next to your domain.',
      'Find **Nameservers**, switch it from Namecheap BasicDNS to **Custom DNS**, and paste the four addresses one per line.',
      'Tap the green check to save. Namecheap will warn you that it takes time; that is normal.',
      'Wait. Usually under an hour, sometimes up to a day. Then open your domain in the browser.',
    ],
    ask: 'Tell HAND the domain name and we will set the nameservers with you on a call, or do it for you if you share access.',
    done: 'Your domain opens the new site with a padlock in the address bar, and so does the `www.` version.',
  },
  {
    id: 'search_console',
    title: 'Tell Google the site exists (Search Console)',
    why: 'Search Console is how Google learns about your site and shows you which searches bring people in. The site already hands Google everything it needs (a sitemap, one address per page, your business details); this step is you claiming it. Ten minutes, no computer needed.',
    actions: [
      { label: 'Open Search Console', kind: 'url', target: 'https://search.google.com/search-console' },
      { label: 'Copy your site address', kind: 'copy', target: 'site' },
      { label: 'Paste the code here', kind: 'field', target: 'seo.google_verification' },
      { label: 'Copy the sitemap address', kind: 'copy', target: 'sitemap' },
    ],
    check: { kind: 'field', path: 'seo.google_verification' },
    phone: [
      'Tap **Open Search Console** and sign in with the Google account you want to keep for the business (use the same one for your Business Profile).',
      'Choose **URL prefix**. Tap **Copy your site address** here, paste it there, and tap Continue.',
      'Under verification methods pick **HTML tag**. Copy only the long code between the quotes after `content=`.',
      'Tap **Paste the code here**, paste it, and tap **Publish changes**.',
      'Back in Search Console tap **Verify**. It should say ownership verified.',
      'In the left menu open **Sitemaps**. Tap **Copy the sitemap address** here, paste it there, and tap **Submit**.',
      'Optional: open **URL inspection**, paste your site address, and tap **Request indexing** so Google visits today instead of in a few days.',
    ],
    ask: 'Add HAND\'s email (hand@handprotocol.org) as a user in Search Console and we will finish it.',
    done: 'Search Console shows the property as verified and the sitemap as Success.',
  },
  {
    id: 'bing',
    title: 'Tell Bing too (Bing Webmaster Tools)',
    why: 'Bing also feeds DuckDuckGo, Yahoo and ChatGPT search, so one more step puts you in all of them. Once Search Console is done, Bing copies it in a couple of taps.',
    actions: [
      { label: 'Open Bing Webmaster Tools', kind: 'url', target: 'https://www.bing.com/webmasters' },
      { label: 'Copy the sitemap address', kind: 'copy', target: 'sitemap' },
      { label: 'Paste a Bing code here', kind: 'field', target: 'seo.bing_verification' },
    ],
    phone: [
      'Do the Search Console step first.',
      'Tap **Open Bing Webmaster Tools** and sign in with the **same Google account**.',
      'Choose **Import your sites from GSC**, allow it, tick your site, and tap **Import**. Bing takes the site and its sitemap from Google: verified, nothing to paste.',
      'If the import does not offer your site, choose **Add your site manually** instead: tap **Copy the sitemap address** here and paste it, then pick **HTML Meta Tag**, copy only the code after `content=`, tap **Paste a Bing code here**, paste it, **Publish changes**, and tap **Verify** in Bing.',
      'Optional: under **Sitemaps**, check that the sitemap shows as Success after a day or two.',
    ],
    ask: 'Add HAND\'s email (hand@handprotocol.org) as a user in Bing Webmaster Tools and we will finish it.',
    done: 'Bing Webmaster Tools lists your site as verified and shows the sitemap.',
  },
  {
    id: 'google_business',
    title: 'Claim your Google Business Profile',
    why: 'When someone searches "mobile mechanic near me", the map results come from Business Profiles, not websites. This is the biggest free source of calls for a mobile mechanic.',
    actions: [{ label: 'Open Google Business', kind: 'url', target: 'https://business.google.com' }],
    phone: [
      'Tap **Open Google Business**, then **Manage now** with the same Google account.',
      'Enter the business name **' + SITE + '** and choose the category **Mobile mechanic** (add Auto repair shop as a second one).',
      'When it asks about a location, choose that you deliver services to customers and **hide your address**. Add your service areas: Austin, Cedar Park, Leander, Round Rock, Georgetown, Pflugerville, Kyle, Buda.',
      'Add your phone number and the website `https://' + DOMAIN + '`.',
      'Verify the business when Google asks (usually a short video of your tools and van, sometimes a phone call or a postcard).',
      'Add photos of your work and ask two or three recent customers for a review.',
    ],
    ask: 'HAND can be added as a manager on the profile and fill in the details for you.',
    done: 'Searching your business name on Google shows the profile with your phone, website, and hours.',
  },
  {
    id: 'old_site',
    title: 'Retire the old site',
    why: 'Once your domain opens the new site, the old page at percesionfix.netlify.app should go away so nobody finds two different versions.',
    actions: [
      { label: 'Open Netlify', kind: 'url', target: 'https://app.netlify.com' },
      { label: 'See the old site', kind: 'url', target: OLD_SITE },
    ],
    phone: [
      'Only do this after the domain step above is done.',
      'Tap **Open Netlify**, sign in with the account you used for the old site, and open it.',
      'Open **Site configuration**, then **General**, scroll to the bottom, and tap **Delete this site**.',
    ],
    ask: 'Or leave it: HAND can point it to the new site instead if you prefer.',
    done: 'The old address no longer loads the old page.',
  },
  {
    id: 'payments',
    title: 'Connect Stripe: try it with a test key, then go live',
    why: 'When you confirm a booking, the customer gets a Pay link for a $50 deposit that comes off the bill (refunded only if you cancel), and your invoices get a Pay button. The money goes straight to your own Stripe account. Until Stripe is connected nobody is asked for a deposit and invoices are marked paid by hand.',
    actions: [
      { label: 'Connect Stripe', kind: 'tab', target: 'payments' },
      { label: 'Create a Stripe account', kind: 'url', target: 'https://dashboard.stripe.com/register' },
      { label: 'Make a key in Stripe', kind: 'url', target: 'https://dashboard.stripe.com/apikeys' },
    ],
    check: { kind: 'stripe' },
    phone: [
      'No Stripe account yet? Tap **Create a Stripe account** first. It asks for your ID, your business details, and the bank account your money is paid out to.',
      '**Test first.** In Stripe, switch on **Test mode**, tap **Make a key in Stripe**, and create a **restricted key** for the website with Checkout Sessions, Refunds and Webhook Endpoints set to **Write**. It starts with `rk_test_`.',
      'Tap **Connect Stripe**, paste the test key, and save. The site sets up the rest.',
      'Send yourself a test booking, confirm it, and pay the deposit with the test card `4242 4242 4242 4242` (any future date, any CVC). Make an invoice to yourself and pay it the same way. Both should show as paid here.',
      '**Then go live.** Switch Test mode off in Stripe, make the same restricted key again (now it starts with `rk_live_`), and paste it on the Payments screen in place of the test key.',
      'Never paste a key that starts with `pk_` (that one cannot take payments) and never send a key by email.',
    ],
    ask: 'Make the key, then send it to HAND in a private message (never by email), and HAND connects it and runs the test with you.',
    done: 'The Payments screen says Stripe is connected in live mode, and a real confirmed booking shows the Pay link in its email.',
  },
];
