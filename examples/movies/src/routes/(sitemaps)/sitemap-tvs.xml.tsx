import { getTvShows } from "~/services/tmdbAPI";
import { sitemapGET } from "./sitemap-utils";

//export the get function with the help of the higher order function
//defined in sitemap-utils. You just need to return the string
export const GET = sitemapGET(async (_, baseURL) => {
  try {
    const popular = await getTvShows("popular");
    let tvsSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`;
    for (let index = 0; index < popular.results.length; index++) {
      const tvShow = popular.results[index];
      tvsSitemap += `
    <url>
        <loc>${baseURL}/tv/${tvShow.id}</loc>
    </url>`;
    }
    tvsSitemap += "</urlset>";
    return tvsSitemap;
  } catch (e) {
    return "";
  }
});
