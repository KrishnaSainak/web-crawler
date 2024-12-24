// npm install axios cheerio

const axios = require('axios');

const cheerio = require('cheerio');

const fs = require('fs');



const normalizeUrl = (url, baseUrl) => {

    try {

        // create a URL object and use baseUrl for relative URLs

        const normalized = new URL(url, baseUrl);



        // remove trailing slash from the pathname, if present

        if (normalized.pathname.endsWith('/')) {

            normalized.pathname = normalized.pathname.slice(0, -1);

        }



        // return the normalized url as a lowercase string

        return normalized.href.toLowerCase();

    } catch (e) {

        console.error(`invalid url: ${url}`);

        return null;

    }

};



// specify the url of the site to crawl

const targetUrl = 'https://www.scrapingcourse.com/ecommerce/';



// high-priority and low-priority queues

let highPriorityQueue = [targetUrl];

let lowPriorityQueue = [targetUrl];



// define the desired crawl limit

const maxCrawlLength = 20;



// to store scraped product data

const productData = [];



// track visited URLs with a set

const visitedUrls = new Set();



// create a new axios instance

const axiosInstance = axios.create();



// set the number of concurrency

const maxConcurrency = 5;



// define a crawler function

const crawler = async () => {

    // define a regex that matches the pagination pattern

    const pagePattern = /page\/\d+/i;



    // helper function to crawl the next url

    const crawlNext = async () => {

        // stop crawling if queues are empty or crawl limit is reached

        if (

            (highPriorityQueue.length === 0 && lowPriorityQueue.length === 0) ||

            visitedUrls.size >= maxCrawlLength

        )

            return;



        // check for URLs in high-priority queue first

        let currentUrl;

        if (highPriorityQueue.length > 0) {

            currentUrl = highPriorityQueue.shift();

        } else {

            // otherwise, get the next url from the low-priority queue

            currentUrl = lowPriorityQueue.shift();

        }



        // normalize the URLs to an absolute path

        const normalizedUrl = normalizeUrl(currentUrl, targetUrl);

        if (!normalizedUrl || visitedUrls.has(normalizedUrl)) return;



        // update the visited URLs set

        visitedUrls.add(normalizedUrl);



        try {

            // request the target URL with the Axios instance

            const response = await axiosInstance.get(normalizedUrl);

            // parse the website's html

            const $ = cheerio.load(response.data);



            // find all links on the page

            const linkElements = $('a[href]');

            linkElements.each((index, element) => {

                let url = $(element).attr('href');



                // normalize the URLs as they're crawled

                const absoluteUrl = normalizeUrl(url, targetUrl);



                // follow links within the target website

                if (

                    absoluteUrl &&

                    absoluteUrl.startsWith(targetUrl) &&

                    !visitedUrls.has(absoluteUrl) &&

                    !highPriorityQueue.includes(absoluteUrl) &&

                    !lowPriorityQueue.includes(absoluteUrl)

                ) {

                    // prioritize paginated pages

                    if (pagePattern.test(absoluteUrl)) {

                        highPriorityQueue.push(absoluteUrl);

                    } else {

                        lowPriorityQueue.push(absoluteUrl);

                    }

                }

            });



            // extract product information from product pages only

            if (pagePattern.test(normalizedUrl)) {

                // retrieve all product containers

                const productContainers = $('.product');



                // iterate through the product containers to extract data

                productContainers.each((index, product) => {

                    const data = {};

                    data.url =

                        $(product)

                            .find('.woocommerce-LoopProduct-link')

                            .attr('href') || 'N/A';

                    data.image =

                        $(product).find('.product-image').attr('src') || 'N/A';

                    data.name =

                        $(product).find('.product-name').text().trim() || 'N/A';

                    data.price =

                        $(product).find('.price').text().trim() || 'N/A';



                    // append the scraped data to the empty array

                    productData.push(data);

                });

            }

        } catch (error) {

            console.error(`error fetching ${currentUrl}: ${error.message}`);

        }

    };



    // manage concurrency by tracking active crawl promises

    const crawlWithConcurrency = async () => {
        const activePromises = new Set();

        // continue crawling as long as there are URLs and crawl limit is not reached
        for (
            ;
            (highPriorityQueue.length > 0 || lowPriorityQueue.length > 0) &&
            visitedUrls.size < maxCrawlLength;

        ) {
            // check if active promises are below max concurrency limit
            if (activePromises.size < maxConcurrency) {
                const crawlPromise = crawlNext().finally(() =>
                    activePromises.delete(crawlPromise)
                );
                activePromises.add(crawlPromise);
            }
            // wait for any of the active promises to resolve
            await Promise.race(activePromises);
        }
        // ensure all ongoing crawls are finished
        await Promise.allSettled(activePromises);
    };

    await crawlWithConcurrency();



    // write productData to a CSV file

    const header = 'Url';

    const csvRows = productData

        .map((item) => `${item.url}`)

        .join('\n');

    const csvData = header + csvRows;



    fs.writeFileSync('products.csv', csvData);

    console.log('csv file has been successfully created!');

};



// execute the crawler function

crawler();
