// Random dataset generator for the simulated payer portal.
// A fresh dataset is generated for every login (see server.js), so names, reference
// numbers, dates, NPIs and statuses differ each session.

const FIRST_NAMES = ['James', 'Mary', 'Robert', 'Patricia', 'John', 'Jennifer', 'Michael', 'Linda', 'David', 'Elizabeth',
  'William', 'Barbara', 'Richard', 'Susan', 'Joseph', 'Jessica', 'Thomas', 'Sarah', 'Charles', 'Karen',
  'Christopher', 'Lisa', 'Daniel', 'Nancy', 'Matthew', 'Betty', 'Anthony', 'Margaret', 'Mark', 'Sandra',
  'Donald', 'Ashley', 'Steven', 'Kimberly', 'Paul', 'Emily', 'Andrew', 'Donna', 'Joshua', 'Michelle',
  'Kenneth', 'Carol', 'Kevin', 'Amanda', 'Brian', 'Dorothy', 'George', 'Melissa', 'Timothy', 'Deborah',
  'Ronald', 'Stephanie', 'Edward', 'Rebecca', 'Jason', 'Sharon', 'Jeffrey', 'Laura', 'Ryan', 'Cynthia',
  'Elsa', 'Donald', 'Patience', 'Mick', 'Priya', 'Wei', 'Luis', 'Fatima', 'Olu', 'Hana'];
const LAST_NAMES = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez',
  'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin',
  'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson',
  'Walker', 'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell', 'Carter', 'Roberts',
  'Doe', 'Mouse', 'Duck', 'Frozen', 'Sick', 'Test', 'Patel', 'Kim', 'Okafor', 'Sato'];
const STAFF = ['Jackson, Jill', 'Nurse, Jane', 'Smith, Sally', 'Brown, Bob', 'Lee, Linda', 'Ortiz, Maria'];

// Weighted so the grid looks realistic; distinct list is exported for filters.
const STATUS_WEIGHTS = [
  ['Approved', 30],
  ['Denied', 10],
  ['Partial Decision', 10],
  ['Needs More Information', 12],
  ['Not Submitted', 13],
  ['Review In Progress', 25],
];
const STATUSES = STATUS_WEIGHTS.map(([s]) => s);
const REQUEST_TYPES = ['Outpatient', 'Outpatient', 'Outpatient', 'Inpatient', 'DME', 'Home Health'];
const SERVICE_CODES = ['70553', '72148', '73721', '97110', '27447', '29881', '99223', 'E0601', 'G0299', '63030', '43239', '93306'];
const DIAGNOSES = ['M54.5', 'M17.11', 'G43.909', 'M25.561', 'J44.9', 'E11.9', 'I10', 'M51.16', 'G47.33', 'Z96.651', 'K21.9', 'I48.91'];
const FACILITIES = ['Springfield Medical Group', 'Riverside Imaging Center', 'Northgate Orthopedics',
  'Lakeview Surgical Associates', 'Metro Physical Therapy', 'Harbor Home Health', 'Summit Cardiology'];

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n) { return String(n).padStart(2, '0'); }
function fmtDate(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fmtDateTime(d) {
  let h = d.getHours();
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12; if (h === 0) h = 12;
  return `${fmtDate(d)} ${pad(h)}.${pad(d.getMinutes())}.${pad(d.getSeconds())} ${ampm}`;
}

/**
 * Generate a randomized dataset.
 * @param {number} [seed] optional seed for reproducible runs (defaults to random)
 * @returns {{ rows: object[], seed: number }}
 */
function generateRequests(seed) {
  if (seed == null) seed = Math.floor(Math.random() * 0xffffffff);
  const rand = mulberry32(seed);
  const pick = (arr) => arr[Math.floor(rand() * arr.length)];
  const pickStatus = () => {
    const total = STATUS_WEIGHTS.reduce((s, [, w]) => s + w, 0);
    let r = rand() * total;
    for (const [s, w] of STATUS_WEIGHTS) { if ((r -= w) < 0) return s; }
    return STATUSES[0];
  };

  const total = 350 + Math.floor(rand() * 200);              // 350-549 requests
  const now = new Date();
  const windowMs = 120 * 24 * 3600 * 1000;                    // last ~120 days
  const trackingBase = 250000 + Math.floor(rand() * 40000);
  const refBase = 300000 + Math.floor(rand() * 9000);

  // Updated timestamps, newest first; tracking IDs mostly increase with time.
  const stamps = [];
  for (let i = 0; i < total; i++) stamps.push(new Date(now.getTime() - rand() * windowMs));
  stamps.sort((a, b) => b - a);

  const usedRef = new Set();
  const rows = stamps.map((updated, i) => {
    const status = pickStatus();
    const notSubmitted = status === 'Not Submitted';
    const createdBy = pick(STAFF);
    const requestType = pick(REQUEST_TYPES);

    const submit = new Date(updated.getTime() - (3 + Math.floor(rand() * 40)) * 1000);
    const svcStart = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate() + Math.floor(rand() * 30) - 7);
    const span = requestType === 'Inpatient' ? 1 + Math.floor(rand() * 5) : (rand() < 0.2 ? Math.floor(rand() * 30) : 0);
    const svcEnd = new Date(svcStart.getFullYear(), svcStart.getMonth(), svcStart.getDate() + span);

    let updatedBy = createdBy;
    const roll = rand();
    if (!notSubmitted && roll < 0.25) updatedBy = 'System';
    else if (roll < 0.35) updatedBy = pick(STAFF);

    let ref = '';
    if (!notSubmitted) {
      do { ref = 'UM' + (refBase + Math.floor(rand() * 20000)); } while (usedRef.has(ref));
      usedRef.add(ref);
    }

    const first = pick(FIRST_NAMES), last = pick(LAST_NAMES);
    return {
      trackingId: trackingBase + (total - i) * 2 + Math.floor(rand() * 2) + 1000,
      referenceNumber: ref,
      status,
      patientName: `${last}, ${first}`,
      serviceStart: fmtDate(svcStart),
      serviceEnd: fmtDate(svcEnd),
      requestType,
      providerNpi: notSubmitted && rand() < 0.4 ? '' : String(1000000000 + Math.floor(rand() * 900000000)),
      submitDate: notSubmitted ? '' : fmtDateTime(submit),
      createdBy,
      updatedDate: fmtDateTime(updated),
      updatedBy,
      // detail-page fields
      memberId: 'MBR' + String(100000 + Math.floor(rand() * 900000)),
      dob: `${1935 + Math.floor(rand() * 80)}-${pad(1 + Math.floor(rand() * 12))}-${pad(1 + Math.floor(rand() * 28))}`,
      serviceCode: pick(SERVICE_CODES),
      diagnosis: pick(DIAGNOSES),
      units: 1 + Math.floor(rand() * 12),
      servicingProvider: pick(FACILITIES),
    };
  });

  return { rows, seed };
}

window.SimData = { generateRequests, STATUSES, REQUEST_TYPES: [...new Set(REQUEST_TYPES)], fmtDateTime };
