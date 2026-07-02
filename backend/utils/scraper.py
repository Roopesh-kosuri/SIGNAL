import httpx
import logging
from bs4 import BeautifulSoup

logger = logging.getLogger("signal.scraper")

async def scrape_article_text(url: str, max_words: int = 1000) -> str:
    """
    Robust, non-blocking webpage extractor.
    Fetches raw HTML, uses beautifulsoup4 to extract text from <p> tags,
    and truncates to max_words.
    """
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"}
            response = await client.get(url, headers=headers)
            response.raise_for_status()
            
            soup = BeautifulSoup(response.text, 'html.parser')
            
            # Extract paragraphs strictly from structural <p> tags
            paragraphs = soup.find_all('p')
            
            text_blocks = [p.get_text(separator=' ', strip=True) for p in paragraphs]
            text_blocks = [t for t in text_blocks if len(t.split()) > 5]
            
            full_text = "\n\n".join(text_blocks)
            
            # Disable truncation
            words = full_text.split()
            # if len(words) > max_words:
            #     words = words[:max_words]
            #     full_text = " ".join(words) + f"...\n\n[TRUNCATED to {max_words} words to conserve tokens]"
                
            if not full_text:
                full_text = "Could not extract readable text from this page."

            return full_text
            
    except Exception as e:
        logger.error(f"Extraction failed for {url}: {e}")
        raise e
