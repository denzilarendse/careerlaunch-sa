export const MAJOR_JOB_SITES = [
  {
    name:'LinkedIn Jobs',
    url:'https://www.linkedin.com/jobs/',
    focus:'Professional, graduate, corporate and remote roles',
    application_mode:'external',
    note:'CareerLaunch can prepare your role-specific pack; submission remains on LinkedIn unless an approved integration is added.'
  },
  {
    name:'Indeed South Africa',
    url:'https://za.indeed.com/',
    focus:'Broad job search across industries',
    application_mode:'external',
    note:'Verify the original employer source when a listing is aggregated.'
  },
  {
    name:'PNet',
    url:'https://www.pnet.co.za/',
    focus:'Professional, technical and general South African vacancies',
    application_mode:'external',
    note:'Use your CareerLaunch CV pack on the employer or PNet application flow.'
  },
  {
    name:'Careers24',
    url:'https://www.careers24.com/',
    focus:'General, graduate and entry-level vacancies',
    application_mode:'external',
    note:'CareerLaunch prepares the documents; the final application is completed on Careers24 or the linked employer site.'
  },
  {
    name:'CareerJunction',
    url:'https://www.careerjunction.co.za/',
    focus:'Professional, technical and management roles',
    application_mode:'external',
    note:'Use official vacancy details to tailor your CareerLaunch application pack.'
  },
  {
    name:'Job Mail',
    url:'https://www.jobmail.co.za/',
    focus:'General, local, driving, trades and service-sector work',
    application_mode:'external',
    note:'Check employer identity and never pay to apply.'
  },
  {
    name:'JOBJACK',
    url:'https://jobjack.co.za/',
    focus:'Entry-level and frontline work',
    application_mode:'external',
    note:'Useful for applicants building a first-job profile.'
  },
  {
    name:'Gumtree Jobs',
    url:'https://www.gumtree.co.za/s-jobs/v1c8p1',
    focus:'Local classifieds and informal-sector vacancies',
    application_mode:'external',
    note:'Higher scam risk: verify the employer independently and never pay an application fee.'
  },
  {
    name:'SAYouth.mobi',
    url:'https://sayouth.mobi/',
    focus:'Youth employment, training and opportunity programmes',
    application_mode:'external',
    note:'Government-supported youth opportunity portal; use the official site for final applications.'
  },
  {
    name:'DPSA Public Service Vacancies',
    url:'https://www.dpsa.gov.za/newsroom/psvaca/',
    focus:'South African national and provincial public-service vacancies',
    application_mode:'external',
    note:'Government adverts frequently require the current Z83 and a detailed CV; follow the specific advert exactly.'
  }
];

export const APPLICATION_FORMS = [
  {
    id:'z83',
    name:'Z83 Application for Employment',
    source:'Department of Public Service and Administration',
    url:'https://www.dpsa.gov.za/dpsa2g/documents/ep/2020/Approved%20New%20Z83%20form%20Gazetted%206%20Nov%202020.pdf',
    category:'government',
    requires_signature:true,
    note:'The current Z83 is effective from 1 January 2021. DPSA guidance requires the declaration to be signed. CareerLaunch can prepare an answer worksheet and completeness review, but it will not sign or make declarations on your behalf.'
  }
];

// Curated starting directory. Price and certificate rules change by course, country and provider;
// the UI deliberately directs learners to official pricing pages instead of freezing unverified prices.
export const LEARNING_RESOURCES = [
  {
    name:'OpenLearn — The Open University',
    url:'https://www.open.edu/openlearn/',
    category:'Free courses',
    cost:'Free',
    certificate:'Free statement of participation or digital badge on selected courses; check each course.',
    recognition:'Open learning; not automatically a formal qualification or accredited credit.',
    focus:'Study skills, business, health, education, technology and personal development.',
    audience:'School leavers, adult learners and anyone exploring a subject.',
    rank:1
  },
  {
    name:'Khan Academy',
    url:'https://www.khanacademy.org/',
    category:'Free courses',
    cost:'Free',
    certificate:'Primarily practice and progress records, not a general professional certificate.',
    recognition:'Supplementary learning; not a formal qualification.',
    focus:'Mathematics, science, computing, economics and foundational skills.',
    audience:'Grades 10–12 and learners refreshing core subjects.',
    rank:2
  },
  {
    name:'Saylor Academy',
    url:'https://www.saylor.org/',
    category:'Free courses',
    cost:'Free courses; check current exam and certificate conditions.',
    certificate:'Course completion certificates may be available; credit transfer depends on the receiving institution.',
    recognition:'Open courses; do not assume automatic South African qualification equivalence.',
    focus:'Business, computer science, communication and general education.',
    audience:'Independent learners and people preparing for further study.',
    rank:3
  },
  {
    name:'Microsoft Learn',
    url:'https://learn.microsoft.com/training/',
    category:'Free courses',
    cost:'Free learning paths; some official certification exams cost extra.',
    certificate:'Learning achievements are available; formal Microsoft certification generally requires the relevant exam.',
    recognition:'Vendor learning and certifications; recognition depends on the role and employer.',
    focus:'Cloud, Microsoft 365, data, security, AI and developer skills.',
    audience:'Beginners through technical professionals.',
    rank:4
  },
  {
    name:'Google Skillshop',
    url:'https://skillshop.withgoogle.com/',
    category:'Free courses',
    cost:'Free training; check the individual credential requirements.',
    certificate:'Selected Google product certifications are available after passing assessments.',
    recognition:'Product-specific credentials, not a general academic qualification.',
    focus:'Digital marketing, Google Ads, Analytics and Google product skills.',
    audience:'Jobseekers interested in marketing, analytics and digital work.',
    rank:5
  },
  {
    name:'Cisco Networking Academy',
    url:'https://www.netacad.com/',
    category:'Free courses',
    cost:'Many learning courses are free; course and certification terms vary.',
    certificate:'Course completion badges/certificates vary; industry certification exams may cost extra.',
    recognition:'Technology skills training; distinguish course completion from Cisco certification.',
    focus:'Networking, cybersecurity, programming and digital skills.',
    audience:'Learners exploring IT support, networking and cybersecurity.',
    rank:6
  },
  {
    name:'Coursera',
    url:'https://www.coursera.org/',
    category:'Free and paid',
    cost:'Some content can be audited or previewed free; certificates, subscriptions and programmes may cost extra.',
    certificate:'Usually paid for certificate-bearing courses; financial aid may be available on eligible courses.',
    recognition:'Provider/university certificates vary; not every course is an accredited qualification.',
    focus:'University-led courses, professional certificates, business, data and technology.',
    audience:'Learners seeking structured courses and employer-oriented skills.',
    rank:7
  },
  {
    name:'edX',
    url:'https://www.edx.org/',
    category:'Free and paid',
    cost:'Many courses offer limited free access; verified certificates and programmes are paid.',
    certificate:'Verified certificates generally require payment.',
    recognition:'Course provider and programme determine recognition; check credit and accreditation claims carefully.',
    focus:'University courses, computer science, business, engineering and professional learning.',
    audience:'Learners wanting university-style online courses.',
    rank:8
  },
  {
    name:'Alison',
    url:'https://alison.com/',
    category:'Free learning; optional paid extras',
    cost:'Course learning is commonly free; certificates, diplomas in print/digital formats or premium features may cost extra.',
    certificate:'Check the current certificate price and format before enrolling.',
    recognition:'Useful for skills development; do not assume every course is formally accredited or equivalent to a qualification.',
    focus:'Workplace skills, business, health and safety, IT and personal development.',
    audience:'Beginners and jobseekers building foundational knowledge.',
    rank:9
  },
  {
    name:'Udemy',
    url:'https://www.udemy.com/',
    category:'Paid courses',
    cost:'Usually per-course purchase with frequent promotions; prices vary by region and course.',
    certificate:'Completion certificate on eligible courses; generally not an accredited academic qualification.',
    recognition:'Course quality and employer value vary; inspect instructor credentials and curriculum.',
    focus:'Practical software, business, creative and professional skills.',
    audience:'Learners who want a specific skill or tool.',
    rank:10
  },
  {
    name:'LinkedIn Learning',
    url:'https://www.linkedin.com/learning/',
    category:'Subscription',
    cost:'Subscription or eligible organisational access; check current South African pricing and trial terms.',
    certificate:'Course completion certificates can be added to a LinkedIn profile; not equivalent to an accredited qualification.',
    recognition:'Professional development evidence; value depends on the role and employer.',
    focus:'Business, project management, office software, leadership and creative technology.',
    audience:'Students, jobseekers and working professionals.',
    rank:11
  },
  {
    name:'FutureLearn',
    url:'https://www.futurelearn.com/',
    category:'Free and paid',
    cost:'Access, upgrades and unlimited plans vary by course and current offer.',
    certificate:'Certificates may require a paid upgrade or plan.',
    recognition:'Course-specific; check whether academic credit is explicitly offered.',
    focus:'Short courses from universities and specialist providers.',
    audience:'Learners exploring a new field or adding focused knowledge.',
    rank:12
  }
];
