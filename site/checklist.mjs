// The owner's Setup checklist, shown as the Setup tab in /admin/. Written
// for a phone first (the owner has Claude Code on his phone and no computer);
// every item says what HAND can do instead. Progress is saved with Publish.
//
// Inline marks: **bold**, `code`. Keep steps short and literal.

export const SITE = 'PrecisionFix';
export const DOMAIN = 'your Namecheap domain'; // replace with the real domain once known, e.g. precisionfix.com
export const REPO = 'precisionfix-site';

export const CHECKLIST = [
  {
    id: 'theme',
    title: 'Pick the look of your site',
    why: 'The site ships with five complete looks. Any of them is live in one tap, and you can change your mind any time.',
    phone: [
      'Preview each look by adding `?theme=` to the site address: `?theme=redline`, `?theme=blueprint`, `?theme=chrome`, `?theme=sunset`, `?theme=terminal`.',
      'In this editor open **Content**, scroll to **Site**, and choose the theme in the dropdown.',
      'Tap **Publish changes** at the bottom. The live site switches within a second.',
    ],
    done: 'The site opens in the look you chose, with no `?theme=` in the address.',
  },
  {
    id: 'copy',
    title: 'Read every line, and check your phone number',
    why: 'Everything on the page is yours to change, in English and Spanish. The phone number is the one thing that must be exactly right before the site goes on your domain.',
    phone: [
      'Open **Content** and go section by section: Hero, Credentials, Services, Why me, Service area, Booking, Contact.',
      'Every English field has a Spanish twin next to it (marked ES). Fix anything that sounds off.',
      'Under **Contact**, confirm the phone number digit by digit and add the email you want booking requests sent to.',
      'Tap **Publish changes**, then open the site and read it on your phone in both languages (the EN / ES switch is at the top).',
    ],
    done: 'You have read the live site in both languages and the number dials you.',
  },
  {
    id: 'photos',
    title: 'Add your own photos',
    why: 'The five photos from your old site are already in. Real cars you worked on beat stock photos every time, and the featured photo is the first thing people see.',
    phone: [
      'Open **Media** and tap **Add photos**. Pick straight from your camera roll; big files are fine, they are resized on your phone.',
      'Tap **Set featured** on the photo you want at the top of the page.',
      'Use the arrows to order the rest. Each photo can carry a caption (the car and what you did).',
      'Tap **Replace** on any photo to swap it without losing its spot.',
    ],
    done: 'The hero and the gallery show your photos with captions.',
  },
  {
    id: 'booking_test',
    title: 'Send yourself a test booking',
    why: 'The booking form emails you every request and sends the customer a confirmation. Prove it works before a real customer finds it.',
    phone: [
      'Open the site, tap **Book a visit**, and fill the form with your own details and email.',
      'Tap send. You should see the thank-you message on the page.',
      'Within a minute, check your inbox: one email titled **Booking request: <your name>** and one confirmation addressed to you as the customer.',
      'Reply to the booking email: it goes straight to the customer address they typed.',
    ],
    ask: 'If nothing arrives within five minutes, tell HAND. We will check the mail logs.',
    done: 'Both emails arrived and the booking shows in the site dashboard.',
  },
  {
    id: 'github',
    title: 'Create your GitHub account',
    why: 'Your site\'s code lives in a GitHub repository. That is what Claude Code on your phone edits, and every change you approve goes live automatically.',
    phone: [
      'Go to **github.com** in your phone browser and tap **Sign up** (the free plan is all you need).',
      'Pick a username you are happy to keep, confirm your email, and finish the questions (skip anything optional).',
      'Send HAND your GitHub username.',
      'HAND adds you to the site\'s repository, `' + REPO + '`. You will get an invitation email: open it and tap **Accept invitation**.',
    ],
    links: [{ label: 'Sign up at GitHub', href: 'https://github.com/signup' }],
    ask: 'Send us the email you want to use and we will walk you through it on a call.',
    done: 'You can open the `' + REPO + '` repository on github.com and see the site\'s files.',
  },
  {
    id: 'claude_code',
    title: 'Connect Claude Code to the site',
    why: 'Once Claude Code can see the repository you can change anything about the site by describing it, from your phone, without touching code.',
    phone: [
      'In the Claude app open **Code** (or go to **claude.ai/code**) and tap **Connect GitHub**.',
      'Authorize Claude, then choose the `' + REPO + '` repository when it asks which repositories it may access.',
      'Start a session on that repository and try something small, for example: "Make the services section show two columns on desktop".',
      'Claude opens a pull request. Open it in the GitHub app or github.com and tap **Merge**. The site updates itself about a minute later.',
    ],
    links: [{ label: 'Open Claude Code', href: 'https://claude.ai/code' }],
    ask: 'HAND can make any change for you the same way. Just describe it.',
    done: 'You have merged one change and seen it live on the site.',
  },
  {
    id: 'supabase',
    title: 'Create your Supabase account',
    why: 'Everything you edit here (your text, your photos, your publish history) lives in a database. Today HAND hosts it inside a shared project. With your own free Supabase account, HAND can move your data into a project that belongs to you, so the whole site is yours to keep.',
    phone: [
      'Go to **supabase.com** in your phone browser and tap **Start your project** (the free plan is all you need).',
      'Sign up with the GitHub account from the step above (fastest), or with the same email you use for this editor.',
      'When it asks for an organization, name it **PrecisionFix** and keep the free plan.',
      'Send HAND the email you signed up with. Nothing to build on your side; HAND sets the project up and adds you as its owner.',
    ],
    links: [{ label: 'Sign up at Supabase', href: 'https://supabase.com/dashboard/sign-up' }],
    ask: 'HAND can walk you through it on a call, or create it with you and hand over the keys.',
    done: 'You can sign in at supabase.com/dashboard and see the PrecisionFix organization.',
  },
  {
    id: 'domain',
    title: 'Point ' + DOMAIN + ' at the new site',
    why: 'You already own the domain on Namecheap. Right now it points nowhere. Two settings on Namecheap send it to this site with HTTPS handled automatically.',
    phone: [
      'HAND sends you **four nameserver addresses** (they look like `dns1.p03.nsone.net`). Have them ready.',
      'Open the **Namecheap** app or **namecheap.com**, sign in, and go to **Domain List**, then **Manage** next to your domain.',
      'Find **Nameservers**, switch it from Namecheap BasicDNS to **Custom DNS**, and paste the four addresses one per line.',
      'Tap the green check to save. Namecheap will warn you that it takes time; that is normal.',
      'Wait. Usually under an hour, sometimes up to a day. Then open your domain in the browser.',
    ],
    links: [{ label: 'Namecheap domain list', href: 'https://ap.www.namecheap.com/domains/list/' }],
    ask: 'Tell HAND the domain name and we will set the nameservers with you on a call, or do it for you if you share access.',
    done: 'Your domain opens the new site with a padlock in the address bar, and so does the `www.` version.',
  },
  {
    id: 'search_console',
    title: 'Tell Google the site exists (Search Console)',
    why: 'Search Console is how Google learns about your site and shows you which searches bring people in. It takes ten minutes and does not need a computer.',
    phone: [
      'Go to **search.google.com/search-console** and sign in with the Google account you want to keep for the business.',
      'Choose **URL prefix**, type your full address `https://' + DOMAIN + '/`, and tap Continue.',
      'Under verification methods pick **HTML tag**. Copy only the long code between the quotes after `content=`.',
      'Come back to this editor: **Content**, then **Search & sharing**, paste the code into **Google verification code**, and tap **Publish changes**.',
      'Back in Search Console tap **Verify**. It should say ownership verified.',
      'In the left menu open **Sitemaps**, type `sitemap.xml`, and tap **Submit**.',
    ],
    links: [{ label: 'Google Search Console', href: 'https://search.google.com/search-console' }],
    ask: 'Add HAND\'s email as a user in Search Console and we will finish it.',
    done: 'Search Console shows the property as verified and the sitemap as Success.',
  },
  {
    id: 'google_business',
    title: 'Claim your Google Business Profile',
    why: 'When someone searches "mobile mechanic near me", the map results come from Business Profiles, not websites. This is the biggest free source of calls for a mobile mechanic.',
    phone: [
      'Go to **business.google.com** and tap **Manage now** with the same Google account.',
      'Enter the business name **' + SITE + '** and choose the category **Mobile mechanic** (add Auto repair shop as a second one).',
      'When it asks about a location, choose that you deliver services to customers and **hide your address**. Add your service areas: Austin, Cedar Park, Leander, Round Rock, Georgetown, Pflugerville, Kyle, Buda.',
      'Add your phone number and the website `https://' + DOMAIN + '`.',
      'Verify the business when Google asks (usually a short video of your tools and van, sometimes a phone call or a postcard).',
      'Add photos of your work and ask two or three recent customers for a review.',
    ],
    links: [{ label: 'Google Business Profile', href: 'https://business.google.com' }],
    ask: 'HAND can be added as a manager on the profile and fill in the details for you.',
    done: 'Searching your business name on Google shows the profile with your phone, website, and hours.',
  },
  {
    id: 'old_site',
    title: 'Retire the old site',
    why: 'Once your domain opens the new site, the old page at percesionfix.netlify.app should go away so nobody finds two different versions.',
    phone: [
      'Only do this after the domain step above is done.',
      'Go to **app.netlify.com**, sign in with the account you used for the old site, and open the old site.',
      'Open **Site configuration**, then **General**, scroll to the bottom, and tap **Delete this site**.',
    ],
    links: [{ label: 'Netlify', href: 'https://app.netlify.com' }],
    ask: 'Or leave it: HAND can point it to the new site instead if you prefer.',
    done: 'The old address no longer loads the old page.',
  },
  {
    id: 'payments',
    title: 'Take deposits when people book',
    later: true,
    why: 'The booking form is built so a deposit step can be added later. When you are ready, a Stripe account is the missing piece.',
    phone: [
      'Go to **stripe.com** and create an account. It asks for your ID, business details, and the bank account for payouts.',
      'Tell HAND when it is approved. We add a deposit step to the booking form and you choose the amount.',
    ],
    links: [{ label: 'Stripe', href: 'https://stripe.com' }],
    done: 'A test booking charges a small deposit and refunds it.',
  },
];
