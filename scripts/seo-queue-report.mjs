import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dateInTimezone, seoTimezone } from "./seo-config.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const contentRoot = path.join(repoRoot, "content");
const reportDate = process.env.PUBLISH_DATE || dateInTimezone();
const targetPerDay = Number(process.env.SEO_TARGET_PER_DAY || 5);

function isPublished(post) {
  return post.status === "published" || (post.status === "scheduled" && post.publishDate <= reportDate);
}

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

  return {
    files,
    posts: groups.flatMap((group) => group.posts),
  };
}

function countByDate(posts) {
  return posts.reduce((acc, post) => {
    acc[post.publishDate] = (acc[post.publishDate] || 0) + 1;
    return acc;
  }, {});
}

function formatByDate(map) {
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => `  ${date}: ${count}`)
    .join("\n");
}

const { files, posts } = await loadPosts();
const published = posts.filter(isPublished);
const scheduled = posts.filter((post) => post.status === "scheduled" && post.publishDate > reportDate);
const publishedToday = published.filter((post) => post.publishDate === reportDate);
const remainingDays = scheduled.length === 0 ? 0 : Math.ceil(scheduled.length / targetPerDay);

console.log(`SEO queue report for ${reportDate} (${seoTimezone})`);
console.log("");
console.log(`Source files: ${files.join(", ")}`);
console.log(`Total posts: ${posts.length}`);
console.log(`Published by date: ${published.length}`);
console.log(`Published today: ${publishedToday.length}`);
console.log(`Scheduled after date: ${scheduled.length}`);
console.log(`Runway at ${targetPerDay}/day: ${remainingDays} day(s)`);
console.log("");
console.log("Posts per date:");
console.log(formatByDate(countByDate(posts)));
