# New Horizon School — Website

Official website for **New Horizon School**, a CBSE-affiliated school in Muzaffarnagar, Uttar Pradesh, educating students from Pre-Primary to Class XII since 2000.

**Live site:** https://yashsgoel123-creator.github.io/New-Horizon-School/

## Pages

| Page | File | Description |
|---|---|---|
| Home | `index.html` | Overview, key stats, highlights, and admissions CTA |
| About | `about.html` | School history, mission & vision, leadership team |
| Academics | `academics.html` | Curriculum by stage (Pre-Primary → Sr. Secondary), co-curriculars |
| Campus | `campus.html` | Facilities, infrastructure, and photo gallery |
| Fees | `fees.html` | Annual & quarterly fee structure, transport, concessions |
| Admissions | `admissions.html` | Admission process, key dates, eligibility & documents |
| Gallery | `gallery.html` | Photos from school events, sports, and achievements |
| Contact | `contact.html` | Address, contact details, map, and enquiry form |

## Tech stack

- Static HTML/CSS/JS — no build step, no framework
- `styles.css` — shared styling for all pages
- `script.js` — shared interactivity: mobile nav, scroll reveal animations, stat counters, gallery/fee tabs, and the contact form submit handler
- Contact form submissions are handled via [Web3Forms](https://web3forms.com/)
- Hosted on **GitHub Pages**

## Project structure

```
New-Horizon-School/
├── index.html
├── about.html
├── academics.html
├── admissions.html
├── campus.html
├── contact.html
├── fees.html
├── gallery.html
├── styles.css
├── script.js
├── sitemap.xml
├── robots.txt
└── assets/
    ├── logo.png
    ├── principal.jpg
    ├── vice-principal.jpg
    └── ... (event & gallery photos)
```

## Local development

No build tools are required. Clone the repo and open any `.html` file directly in a browser, or serve the folder locally:

```bash
git clone https://github.com/yashsgoel123-creator/New-Horizon-School.git
cd New-Horizon-School
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

## Deployment

The site is deployed via GitHub Pages from this repository. Pushes to the default branch are published automatically.

## Notes

- SEO basics (`sitemap.xml`, `robots.txt`, Open Graph/Twitter meta tags, canonical URLs) are included on every page.
