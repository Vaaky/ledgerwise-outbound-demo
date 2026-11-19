/**
 * Demo corpus. Companies here are synthetic (invented names and domains) so the
 * demo never attaches invented facts to a real business. Every record is
 * labelled "demo_seed" in the UI. The research pipeline itself is real and can
 * run against any live domain from the Companies screen.
 */
export interface SeedCompany {
  n: string;
  d: string;
  hq: string;
  rev: string;
  revNote: string;
  hc: number;
  ch: string[];
  trigger: "hiring" | "funding" | "expansion";
  detail: string;
  contact: { name: string; title: string; role: string } | null;
  status:
    | "pending_review"
    | "qualified"
    | "needs_review"
    | "contacted"
    | "engaged"
    | "needs_human"
    | "booked"
    | "opted_out"
    | "rejected";
}

export const SEED_COMPANIES: SeedCompany[] = [
  { n: "Northwind Supply", d: "northwindsupply.co", hq: "Portland, OR", rev: "$4.2M", revNote: "headcount + 38k monthly visits", hc: 18, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Staff Accountant", contact: { name: "Dana Whitfield", title: "COO", role: "COO" }, status: "pending_review" },
  { n: "Kestrel Outdoor", d: "kestreloutdoor.co", hq: "Boulder, CO", rev: "$7.8M", revNote: "headcount + wholesale footprint", hc: 32, ch: ["Shopify", "Wholesale"], trigger: "funding", detail: "Seed", contact: { name: "Mark Ellison", title: "Founder & CEO", role: "Founder" }, status: "booked" },
  { n: "Loom & Larder", d: "loomandlarder.com", hq: "Austin, TX", rev: "$2.1M", revNote: "catalog size + traffic", hc: 9, ch: ["Shopify", "Retail"], trigger: "expansion", detail: "three Texas retail stores", contact: { name: "Priya Raman", title: "Operations Lead", role: "Operations" }, status: "needs_human" },
  { n: "Tidepool Skin", d: "tidepoolskin.com", hq: "San Diego, CA", rev: "$5.5M", revNote: "marketplace velocity + headcount", hc: 22, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Finance Manager", contact: { name: "Alex Moreau", title: "COO", role: "COO" }, status: "engaged" },
  { n: "Bramble Home", d: "bramblehome.co", hq: "Asheville, NC", rev: "$1.4M", revNote: "catalog size + traffic", hc: 7, ch: ["Shopify", "Amazon"], trigger: "expansion", detail: "Canada and the UK", contact: { name: "Nora Kessler", title: "Founder", role: "Founder" }, status: "engaged" },
  { n: "Fernhill Pets", d: "fernhillpets.com", hq: "Columbus, OH", rev: "$3.6M", revNote: "subscription volume + headcount", hc: 14, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Series A", contact: { name: "Tomas Beck", title: "COO", role: "COO" }, status: "booked" },
  { n: "Halyard & Co", d: "halyardandco.com", hq: "Charleston, SC", rev: "$2.9M", revNote: "catalog size + traffic", hc: 11, ch: ["Shopify", "Wholesale"], trigger: "hiring", detail: "Accounting Associate", contact: { name: "Elena Marsh", title: "Founder & CEO", role: "Founder" }, status: "pending_review" },
  { n: "Cinder Coffee", d: "cindercoffee.co", hq: "Denver, CO", rev: "$6.1M", revNote: "subscription base + headcount", hc: 26, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Series A", contact: { name: "Owen Pryce", title: "COO", role: "COO" }, status: "pending_review" },
  { n: "Marrow Goods", d: "marrowgoods.com", hq: "Brooklyn, NY", rev: "$1.8M", revNote: "catalog size + traffic", hc: 8, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Bookkeeper", contact: { name: "Iris Delgado", title: "Founder", role: "Founder" }, status: "pending_review" },
  { n: "Slate & Pine", d: "slateandpine.co", hq: "Seattle, WA", rev: "$3.3M", revNote: "headcount + traffic", hc: 15, ch: ["Shopify", "Amazon", "Retail"], trigger: "expansion", detail: "wholesale and two retail partners", contact: { name: "Marcus Feld", title: "COO", role: "COO" }, status: "pending_review" },
  { n: "Alder Run", d: "alderrun.com", hq: "Burlington, VT", rev: "$4.9M", revNote: "headcount + marketplace presence", hc: 20, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Seed", contact: { name: "Sasha Bell", title: "Founder & CEO", role: "Founder" }, status: "pending_review" },
  { n: "Copper Kettle", d: "copperkettle.co", hq: "Madison, WI", rev: "$2.4M", revNote: "catalog size + traffic", hc: 10, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Operations Coordinator", contact: { name: "Hank Boyle", title: "Owner", role: "Founder" }, status: "pending_review" },
  { n: "Wren & Willow", d: "wrenandwillow.com", hq: "Savannah, GA", rev: "$1.2M", revNote: "catalog size + traffic", hc: 6, ch: ["Shopify", "Wholesale"], trigger: "expansion", detail: "wholesale", contact: { name: "Camille Roux", title: "Founder", role: "Founder" }, status: "pending_review" },
  { n: "Basin Athletics", d: "basinathletics.com", hq: "Salt Lake City, UT", rev: "$8.4M", revNote: "marketplace velocity + headcount", hc: 38, ch: ["Shopify", "Amazon", "Retail"], trigger: "funding", detail: "Series B", contact: { name: "Derek Vaughn", title: "CFO", role: "Finance" }, status: "pending_review" },
  { n: "Foxglove Beauty", d: "foxglovebeauty.com", hq: "Los Angeles, CA", rev: "$5.9M", revNote: "traffic + retail distribution", hc: 24, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Senior Accountant", contact: { name: "Mina Park", title: "COO", role: "COO" }, status: "pending_review" },
  { n: "Quarry Supply", d: "quarrysupply.co", hq: "Pittsburgh, PA", rev: "$3.1M", revNote: "catalog size + traffic", hc: 13, ch: ["Shopify"], trigger: "hiring", detail: "Staff Accountant", contact: { name: "Gabe Sutton", title: "Founder", role: "Founder" }, status: "qualified" },
  { n: "Driftline", d: "driftline.co", hq: "San Francisco, CA", rev: "$6.7M", revNote: "headcount + traffic", hc: 28, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Series A", contact: { name: "Ruth Iyer", title: "COO", role: "COO" }, status: "qualified" },
  { n: "Moss & Main", d: "mossandmain.co", hq: "Nashville, TN", rev: "$2.6M", revNote: "catalog size + traffic", hc: 12, ch: ["Shopify", "Retail"], trigger: "expansion", detail: "two new retail markets", contact: { name: "Claire Donovan", title: "Founder & CEO", role: "Founder" }, status: "qualified" },
  { n: "Tandem Goods", d: "tandemgoods.com", hq: "Chicago, IL", rev: "$4.4M", revNote: "headcount + marketplace presence", hc: 17, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Finance Operations Manager", contact: { name: "Andre Cole", title: "COO", role: "COO" }, status: "qualified" },
  { n: "Pike & Post", d: "pikeandpost.com", hq: "Minneapolis, MN", rev: "$3.8M", revNote: "catalog size + traffic", hc: 16, ch: ["Shopify", "Amazon"], trigger: "expansion", detail: "Amazon and wholesale", contact: { name: "Lena Foster", title: "COO", role: "COO" }, status: "opted_out" },
  { n: "Vellum Home", d: "vellumhome.co", hq: "Brooklyn, NY", rev: "$2.2M", revNote: "catalog size + traffic", hc: 9, ch: ["Shopify"], trigger: "funding", detail: "Seed", contact: { name: "Theo Lang", title: "Founder", role: "Founder" }, status: "contacted" },
  { n: "Harbor Lane", d: "harborlane.co", hq: "Portland, ME", rev: "$1.6M", revNote: "catalog size + traffic", hc: 8, ch: ["Shopify", "Wholesale"], trigger: "hiring", detail: "Bookkeeper", contact: { name: "June Albright", title: "Owner", role: "Founder" }, status: "contacted" },
  { n: "Juniper Row", d: "juniperrow.com", hq: "Santa Fe, NM", rev: "$2.8M", revNote: "headcount + traffic", hc: 11, ch: ["Shopify", "Retail"], trigger: "expansion", detail: "a second store and wholesale", contact: { name: "Rafael Ortiz", title: "COO", role: "COO" }, status: "contacted" },
  { n: "Fieldnote", d: "fieldnote.co", hq: "Missoula, MT", rev: "$5.2M", revNote: "headcount + marketplace presence", hc: 21, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Series A", contact: { name: "Evan Strand", title: "CEO", role: "Founder" }, status: "contacted" },
  { n: "Sundry Co", d: "sundryco.com", hq: "Kansas City, MO", rev: "$3.4M", revNote: "catalog size + traffic", hc: 14, ch: ["Shopify", "Amazon"], trigger: "hiring", detail: "Accounting Manager", contact: null, status: "needs_review" },
  { n: "Wilder Prints", d: "wilderprints.com", hq: "Boise, ID", rev: "$1.1M", revNote: "catalog size + traffic", hc: 6, ch: ["Shopify"], trigger: "expansion", detail: "wholesale", contact: null, status: "needs_review" },
  { n: "Beacon Provisions", d: "beaconprovisions.co", hq: "Providence, RI", rev: "$4.7M", revNote: "headcount + traffic", hc: 19, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Seed", contact: null, status: "needs_review" },
  { n: "Foundry & Flint", d: "foundryandflint.com", hq: "Detroit, MI", rev: "$12.4M", revNote: "headcount + retail footprint", hc: 64, ch: ["Shopify", "Amazon", "Retail"], trigger: "expansion", detail: "national retail", contact: { name: "Wes Harmon", title: "CFO", role: "Finance" }, status: "rejected" },
  { n: "The Slow Store", d: "theslowstore.co", hq: "Tucson, AZ", rev: "$0.6M", revNote: "traffic + catalog size", hc: 3, ch: ["Shopify"], trigger: "hiring", detail: "Part-time Bookkeeper", contact: { name: "Ada Reyes", title: "Founder", role: "Founder" }, status: "rejected" },
  { n: "Cedar & Salt", d: "cedarandsalt.com", hq: "Halifax, NS", rev: "$3.9M", revNote: "headcount + traffic", hc: 15, ch: ["Shopify", "Amazon"], trigger: "funding", detail: "Seed", contact: { name: "Ben Fraser", title: "COO", role: "COO" }, status: "rejected" },
];
