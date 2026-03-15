import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const contentRoot = path.join(repoRoot, "content");
const targetPerDay = Number(process.env.SEO_TARGET_PER_DAY || 5);

const requiredFields = [
  "slug",
  "title",
  "description",
  "publishDate",
  "status",
  "cluster",
  "intent",
  "audience",
  "keywords",
  "intro",
  "problem",
  "solution",
  "takeaways",
  "steps",
  "ctaLabel",
  "ctaHref",
];

async function loadPosts() {
  const files = (await fs.readdir(contentRoot))
    .filter((name) => /^seo-posts.*\.json$/.test(name))
    .sort();

  const groups = await Promise.all(
    files.map(async (name) => {
      const raw = await fs.readFile(path.join(contentRoot, name), "utf8");
      return { name, posts: JSON.parse(raw) };
    }),
  );

  return groups.flatMap((group) => group.posts.map((post) => ({ ...post, __file: group.name })));
}

function addError(errors, message) {
  errors.push(message);
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.length > 0;
}

const posts = await loadPosts();
const errors = [];
const slugMap = new Map();
const countsByDate = new Map();

for (const post of posts) {
  for (const field of requiredFields) {
    if (!(field in post)) {
      addError(errors, `${post.__file}:${post.slug || "<missing-slug>"} missing field "${field}"`);
      continue;
    }

    if (typeof post[field] === "string" && post[field].trim() === "") {
      addError(errors, `${post.__file}:${post.slug} field "${field}" is empty`);
    }
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(post.publishDate)) {
    addError(errors, `${post.__file}:${post.slug} has invalid publishDate "${post.publishDate}"`);
  }

  if (!["published", "scheduled"].includes(post.status)) {
    addError(errors, `${post.__file}:${post.slug} has unsupported status "${post.status}"`);
  }

  if (!isNonEmptyArray(post.keywords)) {
    addError(errors, `${post.__file}:${post.slug} keywords must be a non-empty array`);
  }

  for (const field of ["problem", "solution", "takeaways", "steps"]) {
    if (!isNonEmptyArray(post[field])) {
      addError(errors, `${post.__file}:${post.slug} ${field} must be a non-empty array`);
    }
  }

  if (slugMap.has(post.slug)) {
    addError(errors, `${post.__file}:${post.slug} duplicates slug already used in ${slugMap.get(post.slug)}`);
  } else {
    slugMap.set(post.slug, post.__file);
  }

  countsByDate.set(post.publishDate, (countsByDate.get(post.publishDate) || 0) + 1);
}

const sortedDates = [...countsByDate.keys()].sort((a, b) => a.localeCompare(b));
for (let index = 0; index < sortedDates.length; index += 1) {
  const date = sortedDates[index];
  const count = countsByDate.get(date);

  if (count !== targetPerDay) {
    addError(errors, `publishDate ${date} has ${count} posts; expected ${targetPerDay}`);
  }

  if (index > 0) {
    const previous = new Date(`${sortedDates[index - 1]}T00:00:00Z`);
    const current = new Date(`${date}T00:00:00Z`);
    const diffDays = Math.round((current - previous) / 86400000);
    if (diffDays !== 1) {
      addError(errors, `date gap detected between ${sortedDates[index - 1]} and ${date}`);
    }
  }
}

if (errors.length > 0) {
  console.error("SEO queue lint failed:");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("SEO queue lint passed.");
console.log(`Posts: ${posts.length}`);
console.log(`Dates: ${sortedDates[0]} -> ${sortedDates.at(-1)}`);
console.log(`Cadence: ${targetPerDay}/day across ${sortedDates.length} day(s)`);
