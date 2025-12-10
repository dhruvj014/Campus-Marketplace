"""
AI-powered search using OpenAI to extract search criteria from natural language
"""

import json
import logging
import re
from typing import Dict, Optional, List
from difflib import get_close_matches
from openai import OpenAI, RateLimitError, APIError
from ..config import settings
from ..enums.item import ItemCategory, ItemCondition

logger = logging.getLogger(__name__)

# Initialize OpenAI client
_openai_client = None


def map_category_name_to_enum(category_name: str) -> Optional[str]:
    """
    Map natural language category names to category enum values.
    
    Args:
        category_name: Natural language category name (e.g., "sports equipment", "electronics")
        
    Returns:
        Category enum value or None if no match
    """
    if not category_name:
        return None
    
    category_lower = category_name.lower().strip()
    
    # Mapping of natural language to category enum values
    category_mappings = {
        # Sports/Fitness
        "sports": "sports_fitness",
        "sport": "sports_fitness",
        "sports equipment": "sports_fitness",
        "sport equipment": "sports_fitness",
        "fitness": "sports_fitness",
        "fitness equipment": "sports_fitness",
        "athletic": "sports_fitness",
        "athletics": "sports_fitness",
        "exercise": "sports_fitness",
        "exercise equipment": "sports_fitness",
        "gym": "sports_fitness",
        "gym equipment": "sports_fitness",
        "sports_fitness": "sports_fitness",
        
        # Electronics
        "electronics": "electronics",
        "electronic": "electronics",
        "tech": "electronics",
        "technology": "electronics",
        "device": "electronics",
        "devices": "electronics",
        "computer": "electronics",
        "computers": "electronics",
        "phone": "electronics",
        "phones": "electronics",
        "laptop": "electronics",
        "laptops": "electronics",
        "tablet": "electronics",
        "tablets": "electronics",
        
        # Textbooks
        "textbook": "textbooks",
        "textbooks": "textbooks",
        "book": "textbooks",
        "books": "textbooks",
        "text book": "textbooks",
        "text books": "textbooks",
        
        # Clothing
        "clothing": "clothing",
        "clothes": "clothing",
        "apparel": "clothing",
        "wear": "clothing",
        "garment": "clothing",
        "garments": "clothing",
        
        # Furniture
        "furniture": "furniture",
        "furnishings": "furniture",
        "furnishing": "furniture",
        "furniture item": "furniture",
        "furniture items": "furniture",
        
        # Other
        "other": "other",
        "others": "other",
        "misc": "other",
        "miscellaneous": "other",
    }
    
    # Direct match
    if category_lower in category_mappings:
        return category_mappings[category_lower]
    
    # Partial match (e.g., "sports equipment" contains "sports")
    for key, value in category_mappings.items():
        if key in category_lower or category_lower in key:
            return value
    
    return None


def correct_common_typos(keyword: str) -> str:
    """
    Correct common typos in keywords to improve search matching.
    Returns the corrected keyword or the original if no correction found.
    """
    typo_corrections = {
        # Tennis/racket typos
        "tenis": "tennis",
        "tennis": "tennis",
        "rakcet": "racket",
        "rakets": "racket",
        "rackets": "racket",
        "racket": "racket",
        # Calculator typos
        "callcullator": "calculator",
        "calclator": "calculator",
        "calcuator": "calculator",
        "calc": "calculator",
        "calculator": "calculator",
        "calculators": "calculator",
        # Other common typos
        "laptp": "laptop",
        "laptops": "laptop",
        "laptop": "laptop",
        "gloves": "glove",
        "glove": "glove",
        "glovs": "glove",
        "textbook": "textbook",
        "textbooks": "textbook",
        "textbok": "textbook",
        "phone": "phone",
        "phones": "phone",
        "fone": "phone",
        "shoes": "shoe",
        "shoe": "shoe",
        "shos": "shoe",
    }
    
    keyword_lower = keyword.lower().strip()
    return typo_corrections.get(keyword_lower, keyword)


def extract_price_and_condition(user_query: str) -> tuple:
    """
    Extract price range and condition from natural language query using regex patterns.
    Returns: (min_price, max_price, condition)
    """
    import re
    
    min_price = None
    max_price = None
    condition = None
    
    query_lower = user_query.lower()
    
    # Price extraction patterns
    # "under 50", "below 50", "less than 50", "< 50"
    under_pattern = r'(?:under|below|less\s+than|<\s*)(?:\$?\s*)?(\d+(?:\.\d+)?)'
    under_match = re.search(under_pattern, query_lower)
    if under_match:
        max_price = float(under_match.group(1))
    
    # "over 100", "above 100", "more than 100", "> 100"
    over_pattern = r'(?:over|above|more\s+than|>\s*)(?:\$?\s*)?(\d+(?:\.\d+)?)'
    over_match = re.search(over_pattern, query_lower)
    if over_match:
        min_price = float(over_match.group(1))
    
    # "between 20 and 50"
    between_pattern = r'between\s+(?:\$?\s*)?(\d+(?:\.\d+)?)\s+and\s+(?:\$?\s*)?(\d+(?:\.\d+)?)'
    between_match = re.search(between_pattern, query_lower)
    if between_match:
        min_price = float(between_match.group(1))
        max_price = float(between_match.group(2))
    
    # Condition extraction patterns
    # Order matters: more specific patterns first
    condition_patterns = {
        r'\blike\s*new\s*(?:condition)?\b': 'like_new',  # "like new" or "like new condition"
        r'\balmost\s*new\s*(?:condition)?\b': 'like_new',  # "almost new" or "almost new condition"
        r'\bnew\b': 'new',
        r'\bgood\s*(?:condition)?\b': 'good',
        r'\bfair\s*(?:condition)?\b': 'fair',
        r'\bpoor\s*(?:condition)?\b': 'poor',
        r'\bused\b': 'good',  # Default used items to "good" condition
        r'\bsecond\s*hand\b': 'good'
    }
    
    for pattern, cond_value in condition_patterns.items():
        if re.search(pattern, query_lower):
            condition = cond_value
            break
    
    return min_price, max_price, condition


def get_openai_client() -> Optional[OpenAI]:
    """
    Get LLM client instance (supports OpenAI, Groq, Together, Fireworks, DeepInfra)
    All providers use OpenAI-compatible API
    """
    global _openai_client
    if not settings.openai_api_key:
        logger.warning("LLM API key not configured. AI search will not work.")
        return None
    
    provider = getattr(settings, 'llm_provider', 'groq').lower()
    
    # Map provider to base URL
    base_urls = {
        'openai': None,  # OpenAI uses default (api.openai.com)
        'groq': getattr(settings, 'groq_base_url', 'https://api.groq.com/openai/v1'),
        'together': getattr(settings, 'together_base_url', 'https://api.together.xyz/v1'),
        'fireworks': getattr(settings, 'fireworks_base_url', 'https://api.fireworks.ai/inference/v1'),
        'deepinfra': getattr(settings, 'deepinfra_base_url', 'https://api.deepinfra.com/v1/openai'),
    }
    
    base_url = base_urls.get(provider)
    
    if _openai_client is None:
        if base_url:
            # Use custom base URL for alternative providers
            _openai_client = OpenAI(
                api_key=settings.openai_api_key,
                base_url=base_url,
                timeout=30.0,  # 30 second timeout
                max_retries=2  # Limit retries to avoid long waits
            )
            logger.info(f"Initialized {provider.upper()} client with base URL: {base_url}")
        else:
            # Use default OpenAI
            _openai_client = OpenAI(
                api_key=settings.openai_api_key,
                timeout=30.0,  # 30 second timeout
                max_retries=2  # Limit retries to avoid long waits
            )
            logger.info("Initialized OpenAI client")
    
    return _openai_client


def extract_search_criteria(user_query: str, context: Optional[Dict[str, any]] = None) -> Dict[str, any]:
    """
    Extract search criteria from natural language query using OpenAI.
    ChatGPT will intelligently:
    - Correct spelling errors automatically (e.g., "callcullator" → "calculator")
    - Identify product names and suggest variations (e.g., ["calculator", "calc", "graphing calculator"])
    - Detect category from static list
    - Extract condition if mentioned
    - Extract price range if mentioned
    
    Args:
        user_query: Natural language description of what user wants
        context: Optional previous search criteria to merge with new query
        
    Returns:
        Dictionary with extracted search criteria:
        {
            "product_names": ["corrected_name", "variation1", "variation2"],  # Product name variations for DB search
            "category": "electronics" | None,  # From static category list
            "condition": "like_new" | None,  # If mentioned in query
            "min_price": float | None,  # If mentioned in query
            "max_price": float | None,  # If mentioned in query
            "description": "cleaned description"
        }
    """
    # Merge context with new query if context exists
    merged_query = user_query
    should_merge_context = False
    
    if context:
        context_product_names = context.get("product_names", [])
        reference_words = {"ones", "those", "them", "it", "these", "that", "this", "like", "new", "used", "good", "fair", "poor"}
        query_lower = user_query.lower()
        has_reference = any(ref in query_lower for ref in reference_words)
        
        # Check if query is just adding filters (condition, price) without product names
        # Examples: "like new", "under 50", "new condition", "less than 100"
        filter_only_keywords = {"like", "new", "used", "good", "fair", "poor", "condition", 
                                "under", "below", "less", "than", "over", "above", "more", 
                                "between", "dollar", "dollars", "$", "price", "cost"}
        query_words = set(query_lower.split())
        is_filter_only = len(query_words - filter_only_keywords) == 0 or (len(query_words) <= 3 and query_words.issubset(filter_only_keywords | {"a", "an", "the", "in"}))
        
        # Merge context if:
        # 1. Has explicit reference words, OR
        # 2. Query is filter-only (just adding condition/price to previous search), OR
        # 3. Query doesn't contain product names but context has product names
        should_merge_context = has_reference or is_filter_only or (not any(len(w) > 3 for w in query_words if w not in filter_only_keywords) and context_product_names)
        
        if should_merge_context and context_product_names:
            # User is referring to previous search, merge context
            merged_query = f"{' '.join(context_product_names)} {user_query}"
            logger.info(f"Merging context: '{merged_query}' (context product names: {context_product_names}, is_filter_only: {is_filter_only})")
    
    # Get LLM client (OpenAI, Groq, Together, etc.)
    client = get_openai_client()
    if not client:
        provider = getattr(settings, 'llm_provider', 'groq')
        logger.warning(f"{provider.upper()} API key not configured. Returning basic fallback.")
        # Minimal fallback - just return the query as product name
        return {
            "product_names": [user_query.strip()],
            "category": None,
            "condition": None,
            "min_price": None,
            "max_price": None,
            "description": user_query
        }
    
    # Get available categories and conditions
    categories = [cat.value for cat in ItemCategory]
    conditions = [cond.value for cond in ItemCondition]
    
    # Build context info for prompt
    context_info = ""
    if context:
        context_parts = []
        if context.get("product_names"):
            context_parts.append(f"Previous search was for: {', '.join(context.get('product_names', []))}")
        elif context.get("min_price") or context.get("max_price") or context.get("category") or context.get("condition"):
            # If no product names but has filters, indicate this is a filter-only context
            context_parts.append("Previous search had filters applied (no specific product)")
        if context.get("category"):
            context_parts.append(f"Category: {context.get('category')}")
        if context.get("condition"):
            context_parts.append(f"Condition: {context.get('condition')}")
        if context.get("min_price") or context.get("max_price"):
            price_range = []
            if context.get("min_price"):
                price_range.append(f"min: ${context.get('min_price')}")
            if context.get("max_price"):
                price_range.append(f"max: ${context.get('max_price')}")
            context_parts.append(f"Price: {', '.join(price_range)}")
        
        if context_parts:
            context_info = f"\n\nCONTEXT (previous search): {'; '.join(context_parts)}\nIf the user query refers to 'ones', 'those', 'them', 'it', etc., OR if the query is just adding filters (like 'like new', 'under 50'), apply the new filters to the previous search criteria. Keep the previous filters (price, category, condition) unless the new query explicitly changes them."
    
    # Create intelligent prompt for OpenAI
    system_prompt = f"""You are a search assistant for a campus marketplace. 
Extract search criteria from user queries and return JSON with the following structure:

IMPORTANT: Handle ALL question formats including "do you have X?", "have you got X?", "show me X", "I need X", "looking for X" - extract the product/object from these questions!
{{
    "product_names": ["corrected_product_name", "variation1", "variation2", ...] or [],
    "category": "category_name" or null,
    "condition": "condition_name" or null,
    "min_price": number or null,
    "max_price": number or null,
    "description": "cleaned description"
}}

Available categories (MUST use exact values): {", ".join(categories)}
Available conditions (MUST use exact values): {", ".join(conditions)}

CRITICAL INSTRUCTIONS:

1. PRODUCT NAME EXTRACTION:
   - CRITICAL: Extract the OBJECT/NOUN from questions, especially "do you have X?", "can you show me X", "show me some X" formats
   - "do you have tennis?" → Extract "tennis" → ["tennis racket", "racket", "tennis rackets", "rackets"]
   - "do you have gloves?" → Extract "gloves" → ["gloves", "glove"]
   - "can you show me some calci?" → Extract "calci" (abbreviation for calculator) → ["calculator", "calc", "graphing calculator"]
   - "show me some laptops" → Extract "laptops" → ["laptop", "laptops", "notebook", "notebook computer"]
   - "can you show me calculators?" → Extract "calculators" → ["calculator", "calc", "graphing calculator"]
   - "show me some textbooks" → Extract "textbooks" → ["textbook", "textbooks", "book", "books"]
   - "any other stuff" or "other items" → This is vague, return product_names: [] and let category/price filters handle it
   - When user asks "do you have X?", "can you show me X", "show me some X" - X is the product they're looking for - extract it!
   - Handle abbreviations: "calci" → "calculator", "laptp" → "laptop", "textbok" → "textbook"
   - AUTOMATICALLY CORRECT SPELLING ERRORS: If user types "callcullator", return ["calculator", "calc", "graphing calculator"]
   - If user types "tenis racket", return ["tennis racket", "racket", "tennis rackets"]
   - Generate 2-5 product name variations that might appear in the database
   - Include: correct spelling, common abbreviations, plural/singular forms, related terms
   - Examples:
     * "do you have tennis?" → product_names: ["tennis racket", "racket", "tennis rackets", "rackets"], category: null
     * "do you have gloves?" → product_names: ["gloves", "glove"], category: null
     * "do you have laptops?" → product_names: ["laptop", "laptops", "notebook"], category: null
     * "callcullator" → ["calculator", "calc", "graphing calculator", "scientific calculator"]
     * "laptp" → ["laptop", "laptops", "notebook", "notebook computer"]
     * "tenis rackets" → ["tennis racket", "racket", "tennis rackets", "rackets"]
     * "iPhone" → ["iPhone", "iphone", "iphones", "iPhone 15", "iPhone 14"]

2. CATEGORY DETECTION:
   - ONLY use categories from the static list above
   - Extract category if mentioned: "electronics", "sports equipment", "textbooks", "clothing", "furniture"
   - If user searches for a specific product, set category to null (unless explicitly mentioned)
   - If user searches for a category (e.g., "electronics", "sports equipment"), set product_names to [] and set category
   - Map common terms to categories:
     * "sports", "sports equipment", "fitness", "athletic" → "sports_fitness"
     * "electronics", "tech", "technology" → "electronics"
     * "textbook", "textbooks", "books" → "textbooks"
     * "clothing", "clothes", "apparel" → "clothing"
     * "furniture", "furnishings" → "furniture"
   - Examples:
     * "calculator" → category: null (product search)
     * "electronics" → category: "electronics", product_names: []
     * "laptop in electronics" → category: "electronics", product_names: ["laptop", "laptops", "notebook"]
     * "do you have sports equipment?" → category: "sports_fitness", product_names: []
     * "tennis rackets in sports" → category: "sports_fitness", product_names: ["tennis racket", "racket"]

3. CONDITION EXTRACTION:
   - Extract condition ONLY if mentioned in query
   - "new" → "new"
   - "used" or "second-hand" → "good" or "fair" (infer from context)
   - "like new" or "almost new" → "like_new"
   - "good condition" → "good"
   - "fair condition" → "fair"
   - "poor condition" → "poor"

4. PRICE/AMOUNT/COST EXTRACTION (CRITICAL - ALWAYS EXTRACT WHEN MENTIONED):
   - ALWAYS extract price/amount/cost information if ANY price-related words appear in the query
   - Price-related keywords: "under", "below", "less than", "cheaper than", "over", "above", "more than", "at least", "between", "$", "dollars", "dollar", "cost", "price", "amount", "budget"
   - Patterns to extract:
     * "under 50" or "below 50" or "less than 50" or "cheaper than 50" or "under $50" → max_price: 50
     * "over 100" or "above 100" or "more than 100" or "at least 100" or "over $100" → min_price: 100
     * "between 20 and 50" or "20 to 50" or "between $20 and $50" → min_price: 20, max_price: 50
     * "$50" or "50 dollars" or "50$" or "cost 50" or "price 50" → max_price: 50 (if context suggests upper limit)
     * "around 50" or "about 50" → min_price: 45, max_price: 55 (approximate range)
     * "under $50" or "below $50" → max_price: 50
     * "over $100" or "above $100" → min_price: 100
     * "maximum 50" or "max 50" → max_price: 50
     * "minimum 100" or "min 100" → min_price: 100
   - Examples (VERY IMPORTANT):
     * "tennis rackets under 50" → product_names: ["tennis racket", "racket"], max_price: 50
     * "do you have rackets under 40?" → product_names: ["racket", "rackets"], max_price: 40
     * "laptops over 500" → product_names: ["laptop", "laptops"], min_price: 500
     * "gloves between 20 and 30" → product_names: ["gloves", "glove"], min_price: 20, max_price: 30
     * "calculators under $30" → product_names: ["calculator", "calc"], max_price: 30
     * "show me laptops costing less than 1000" → product_names: ["laptop", "laptops"], max_price: 1000
     * "items priced around 50 dollars" → min_price: 45, max_price: 55
   - CRITICAL: If user mentions ANY price/cost/amount, you MUST extract it - never leave price fields as null if price is mentioned!
   - CRITICAL: Extract the numeric value even if it's written as "$50", "50 dollars", "50$", "cost 50", etc.

5. CATEGORY-ONLY QUERIES:
   - If user asks for "electronics", "sports equipment", "textbooks", etc. (without specific product)
   - Set product_names to [] and set the appropriate category
   - Examples:
     * "electronics" → product_names: [], category: "electronics"
     * "show all sports equipment" → product_names: [], category: "sports_fitness"

6. QUESTION FORMAT HANDLING (CRITICAL - READ CAREFULLY):
   - When user asks "do you have X?", "have you got X?", "can you show me X", "show me some X", "I need X", "looking for X", "any X?"
   - YOU MUST EXTRACT X as the product name - this is what they're searching for
   - IGNORE the question words ("do you have", "have you got", "can you show me", "show me", "some", "I need", "looking for", "any") - they are just conversational phrasing
   - FOCUS ON EXTRACTING THE PRODUCT/OBJECT mentioned after these phrases
   - ALWAYS extract price/amount if mentioned in the same query
   - Handle abbreviations: "calci" = "calculator", "laptp" = "laptop", "textbok" = "textbook"
   - Examples (VERY IMPORTANT - FOLLOW THESE EXACTLY):
     * "do you have tennis?" → product_names: ["tennis racket", "racket", "tennis rackets", "rackets"], category: null, min_price: null, max_price: null
     * "do you have rackets?" → product_names: ["racket", "tennis racket", "rackets", "tennis rackets"], category: null, min_price: null, max_price: null
     * "do you have gloves?" → product_names: ["gloves", "glove"], category: null, min_price: null, max_price: null
     * "can you show me some calci?" → product_names: ["calculator", "calc", "graphing calculator"], category: null, min_price: null, max_price: null
     * "show me some laptops" → product_names: ["laptop", "laptops", "notebook"], category: null, min_price: null, max_price: null
     * "have you got laptops?" → product_names: ["laptop", "laptops", "notebook"], category: null, min_price: null, max_price: null
     * "show me calculators" → product_names: ["calculator", "calc", "graphing calculator"], category: null, min_price: null, max_price: null
     * "I need textbooks" → product_names: ["textbook", "textbooks", "book"], category: null, min_price: null, max_price: null
     * "do you have tennis under 50?" → product_names: ["tennis racket", "racket", "tennis rackets"], max_price: 50, category: null, min_price: null
     * "do you have rackets under 40?" → product_names: ["racket", "tennis racket", "rackets"], max_price: 40, category: null, min_price: null
     * "do you have rackets costing less than 40?" → product_names: ["racket", "tennis racket", "rackets"], max_price: 40, category: null, min_price: null
     * "any laptops over 500?" → product_names: ["laptop", "laptops"], min_price: 500, category: null, max_price: null
     * "can you show me some calci under 30?" → product_names: ["calculator", "calc"], max_price: 30, category: null, min_price: null
     * "show me laptops priced around $500" → product_names: ["laptop", "laptops"], min_price: 450, max_price: 550, category: null
   - For vague queries like "any other stuff", "other items", "anything else" → product_names: [] (let category/price filters handle it if mentioned)
   - CRITICAL: "do you have rackets?" → Extract "rackets" NOT "do you have rackets" - remove the question phrase!
   - CRITICAL: "do you have rackets under 40?" → Extract product_names: ["racket", "rackets", "tennis racket"] AND max_price: 40
   - CRITICAL: If price/cost/amount is mentioned, ALWAYS extract it - never leave price fields as null!
   - REMEMBER: "do you have tennis?" means they want to search for "tennis rackets" or "tennis" related items - extract "tennis" as the product!
   - REMEMBER: "can you show me some calci?" means they want calculators - extract "calci" (abbreviation) and convert to ["calculator", "calc"]
   - REMEMBER: "show me some X" - extract X as the product, ignore "some" (it's just a quantifier)
   - REMEMBER: Price extraction is MANDATORY when price-related words appear - extract numeric values from "$50", "50 dollars", "cost 50", "priced at 50", etc.
   - The question format is just conversational - extract the actual product/object they're asking about!

Return only valid JSON, no additional text or markdown."""

    user_prompt = f"User query: {merged_query}{context_info}\n\nExtract search criteria:"
    
    # Determine which provider is being used
    provider = settings.openai_provider.lower() if hasattr(settings, 'openai_provider') else "openai"
    provider_name = "Groq" if provider == "groq" else "OpenAI" if provider == "openai" else provider.upper()
    
    logger.info(f"🤖 Using {provider_name} AI for search criteria extraction")
    
    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.2,  # Low temperature for consistent extraction
            max_tokens=300
        )
        
        content = response.choices[0].message.content.strip()
        
        logger.info(f"✅ {provider_name} AI response received")
        logger.info(f"=== {provider_name.upper()} RAW RESPONSE ===")
        logger.info(f"Raw response: {content}")
        
        # Parse JSON response
        try:
            # Remove markdown code blocks if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            logger.info(f"Cleaned response: {content}")
            criteria = json.loads(content)
            logger.info(f"Parsed JSON: {criteria}")
            
            # Validate and normalize the response
            product_names = criteria.get("product_names", [])
            if not isinstance(product_names, list):
                product_names = [product_names] if product_names else []
            
            # Ensure product names are strings and non-empty
            product_names = [str(pn).strip() for pn in product_names if pn and str(pn).strip()]
            
            # Validate category
            category = criteria.get("category")
            if category and category not in categories:
                logger.warning(f"Invalid category '{category}' returned by AI. Setting to null.")
                category = None
            
            # Validate condition
            condition = criteria.get("condition")
            if condition and condition not in conditions:
                logger.warning(f"Invalid condition '{condition}' returned by AI. Setting to null.")
                condition = None
            
            # Validate prices
            min_price = criteria.get("min_price")
            max_price = criteria.get("max_price")
            if min_price is not None:
                try:
                    min_price = float(min_price)
                except (ValueError, TypeError):
                    min_price = None
            if max_price is not None:
                try:
                    max_price = float(max_price)
                except (ValueError, TypeError):
                    max_price = None
            
            # Swap prices if min > max
            if min_price is not None and max_price is not None and min_price > max_price:
                min_price, max_price = max_price, min_price
            
            # Merge with context if provided
            if context and should_merge_context:
                # If new query has product names, use them; otherwise keep context
                if not product_names and context.get("product_names"):
                    product_names = context.get("product_names", [])
                    logger.info(f"Merged product_names from context: {product_names}")
                
                # If new query has category, use it; otherwise keep context
                if not category and context.get("category"):
                    category = context.get("category")
                    logger.info(f"Merged category from context: {category}")
                
                # Merge condition: new query overrides, but if new query doesn't have condition, keep context
                if condition:
                    logger.info(f"Using condition from new query: {condition}")
                elif context.get("condition"):
                    condition = context.get("condition")
                    logger.info(f"Merged condition from context: {condition}")
                
                # Merge prices: new query overrides, but if new query doesn't have prices, keep context
                if min_price is not None:
                    logger.info(f"Using min_price from new query: {min_price}")
                elif context.get("min_price") is not None:
                    min_price = context.get("min_price")
                    logger.info(f"Merged min_price from context: {min_price}")
                
                if max_price is not None:
                    logger.info(f"Using max_price from new query: {max_price}")
                elif context.get("max_price") is not None:
                    max_price = context.get("max_price")
                    logger.info(f"Merged max_price from context: {max_price}")
            
            result = {
                "product_names": product_names,
                "category": category,
                "condition": condition,
                "min_price": min_price,
                "max_price": max_price,
                "description": criteria.get("description", merged_query)
            }
            
            logger.info(f"Extracted search criteria: {result}")
            return result
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse LLM response as JSON: {e}")
            logger.error(f"Response content: {content}")
            # Fallback: try basic spelling correction
            corrected_names = _simple_spelling_correction(merged_query.strip())
            logger.warning(f"LLM JSON parse failed, using fallback spelling correction: {corrected_names}")
            return {
                "product_names": corrected_names,
                "category": None,
                "condition": None,
                "min_price": None,
                "max_price": None,
                "description": merged_query
            }
            
    except RateLimitError as e:
        logger.error(f"❌ Rate limit error from {provider_name} API: {e}")
        logger.warning(f"⚠️  Switching to FALLBACK mechanism (regex-based extraction)")
        # Fallback: extract product names and prices using simple parsing
        fallback_result = _extract_fallback_criteria(merged_query.strip())
        fallback_result["extraction_method"] = "Fallback (Rate Limited)"
        logger.warning(f"🔧 Fallback extraction result: {fallback_result}")
        return fallback_result
    except APIError as e:
        logger.error(f"❌ API error from {provider_name}: {e}")
        logger.warning(f"⚠️  Switching to FALLBACK mechanism (regex-based extraction)")
        # Fallback: extract product names and prices using simple parsing
        fallback_result = _extract_fallback_criteria(merged_query.strip())
        fallback_result["extraction_method"] = "Fallback (API Error)"
        logger.warning(f"🔧 Fallback extraction result: {fallback_result}")
        return fallback_result
    except Exception as e:
        logger.error(f"❌ Error calling {provider_name} API: {e}")
        logger.warning(f"⚠️  Switching to FALLBACK mechanism (regex-based extraction)")
        # Fallback: extract product names and prices using simple parsing
        fallback_result = _extract_fallback_criteria(merged_query.strip())
        fallback_result["extraction_method"] = "Fallback (Error)"
        logger.warning(f"🔧 Fallback extraction result: {fallback_result}")
        return fallback_result


def _extract_fallback_criteria(query: str) -> Dict[str, any]:
    """
    Fallback extraction when LLM is unavailable.
    Extracts product names and price information using simple regex patterns.
    Note: This is a basic fallback. For best results, use the LLM (Groq/OpenAI).
    """
    logger.info("🔧 FALLBACK: Using regex-based extraction (no AI)")
    query_lower = query.lower().strip()
    
    # Extract product names (simple - will match common products)
    product_names = _simple_spelling_correction(query_lower)
    
    # Extract price information using regex
    min_price = None
    max_price = None
    
    # Patterns for "under", "below", "less than", "cheaper than"
    under_patterns = [
        r'under\s+\$?(\d+(?:\.\d+)?)',
        r'below\s+\$?(\d+(?:\.\d+)?)',
        r'less\s+than\s+\$?(\d+(?:\.\d+)?)',
        r'cheaper\s+than\s+\$?(\d+(?:\.\d+)?)',
        r'under\s+(\d+(?:\.\d+)?)\s*dollars?',
    ]
    
    # Patterns for "over", "above", "more than", "at least"
    over_patterns = [
        r'over\s+\$?(\d+(?:\.\d+)?)',
        r'above\s+\$?(\d+(?:\.\d+)?)',
        r'more\s+than\s+\$?(\d+(?:\.\d+)?)',
        r'at\s+least\s+\$?(\d+(?:\.\d+)?)',
        r'over\s+(\d+(?:\.\d+)?)\s*dollars?',
    ]
    
    # Patterns for "between X and Y"
    between_pattern = r'between\s+\$?(\d+(?:\.\d+)?)\s+and\s+\$?(\d+(?:\.\d+)?)'
    
    # Check for "under" patterns
    for pattern in under_patterns:
        match = re.search(pattern, query_lower)
        if match:
            max_price = float(match.group(1))
            break
    
    # Check for "over" patterns
    if max_price is None:  # Only check if we didn't find "under"
        for pattern in over_patterns:
            match = re.search(pattern, query_lower)
            if match:
                min_price = float(match.group(1))
                break
    
    # Check for "between" pattern
    between_match = re.search(between_pattern, query_lower)
    if between_match:
        min_price = float(between_match.group(1))
        max_price = float(between_match.group(2))
    
    result = {
        "product_names": product_names,
        "category": None,
        "condition": None,
        "min_price": min_price,
        "max_price": max_price,
        "description": query,
        "extraction_method": "Fallback (Regex)"
    }
    logger.info(f"🔧 FALLBACK extraction complete: {result}")
    return result


def _simple_spelling_correction(query: str) -> List[str]:
    """
    Simple spelling correction fallback when LLM is unavailable.
    Uses common product names and fuzzy matching.
    """
    # Remove price-related words for product name extraction
    query_clean = re.sub(r'\b(under|below|over|above|less|more|than|at least|between|and|\$|\d+)\b', '', query, flags=re.IGNORECASE)
    query_clean = query_clean.strip()
    
    # Common product names that might be in the database
    common_products = [
        "calculator", "calc", "graphing calculator", "scientific calculator",
        "laptop", "laptops", "notebook", "computer",
        "phone", "iphone", "smartphone",
        "textbook", "book", "books",
        "racket", "tennis racket", "tennis rackets", "rackets",
        "gloves", "glove",
        "shoes", "shoe",
        "bike", "bicycle",
        "chair", "desk", "table",
        "cricket", "cricket bat", "cricket ball", "cricket equipment"
    ]
    
    query_lower = query_clean.lower().strip()
    
    # Try to find close matches (fuzzy matching)
    close_matches = get_close_matches(query_lower, common_products, n=3, cutoff=0.6)
    
    if close_matches:
        # Found a match - return the corrected name and variations
        corrected = close_matches[0]
        variations = [corrected]
        
        # Add related variations
        if "calculator" in corrected:
            variations.extend(["calculator", "calc", "graphing calculator"])
        elif "laptop" in corrected:
            variations.extend(["laptop", "laptops", "notebook"])
        elif "racket" in corrected:
            variations.extend(["racket", "tennis racket", "rackets", "tennis rackets"])
        elif "cricket" in corrected:
            variations.extend(["cricket", "cricket bat", "cricket ball"])
        
        return list(set(variations))  # Remove duplicates
    
    # No close match found - return original query (cleaned)
    return [query_clean] if query_clean else [query]


def find_similar_items_by_semantics(
    user_query: str,
    items: List[Dict],
    top_k: int = 10
) -> List[Dict]:
    """
    Use OpenAI embeddings to find semantically similar items
    
    This approach compares the semantic meaning of the query with item descriptions
    """
    if not settings.openai_api_key:
        logger.warning("OpenAI API key not configured for semantic search")
        return []
    
    client = get_openai_client()
    if not client:
        return []
        category = map_category_name_to_enum(user_query)
        
        # If that doesn't work, check for category keywords
        if not category:
            if any(term in query_lower for term in ["sports", "fitness", "athletic", "exercise", "gym"]):
                category = "sports_fitness"
            elif any(term in query_lower for term in ["electronics", "tech", "phone", "laptop", "computer", "device"]):
                category = "electronics"
            elif any(term in query_lower for term in ["textbook", "book", "text book"]):
                category = "textbooks"
            elif any(term in query_lower for term in ["clothing", "clothes", "apparel", "wear"]):
                category = "clothing"
            elif any(term in query_lower for term in ["furniture", "furnishing"]):
                category = "furniture"
            elif any(term in query_lower for term in ["other", "misc", "miscellaneous"]):
                category = "other"
        
        # Map to enum value if found
        if category:
            category = map_category_name_to_enum(category) or category
        
        # If multiple keywords, prefer product names over descriptive words
        if len(keywords) > 1:
            product_keywords = {"gloves", "laptop", "phone", "iphone", "textbook", "book", 
                               "racket", "rackets", "tennis", "shoes", "bag", "backpack", "chair", 
                               "table", "desk", "bike", "bicycle", "car", "calculator"}
            product_matches = [kw for kw in keywords if kw in product_keywords]
            if product_matches:
                # Prioritize longer/more specific product names (e.g., "rackets" over "tennis")
                # Sort by length descending, then use the longest
                product_matches.sort(key=len, reverse=True)
                keywords = [product_matches[0]]  # Use most specific product name
                logger.info(f"Fallback: Multiple keywords, using product keyword: {keywords}")
            else:
                # If no known product, use longest keyword
                keywords = [max(keywords, key=len)]
                logger.info(f"Fallback: Multiple keywords, using longest: {keywords}")
        
        logger.info(f"Fallback: Extracted keywords: {keywords}, category: {category}, price range - min: {min_price}, max: {max_price}, condition: {condition}")
        
        # Determine if this is a category-only query
        # If category is detected and query seems to be about the category (not a specific product), treat as category query
        query_lower = merged_query.lower().strip()
        is_category_query = False
        if category:
            # First check if the query is exactly the category name
            mapped_category = map_category_name_to_enum(query_lower)
            if mapped_category == category:
                is_category_query = True
                logger.info(f"Fallback: Query '{query_lower}' is exactly category name '{category}', treating as category query")
            elif (
                any(term in query_lower for term in ["equipment", "items", "products", "stuff", "things", "show all", "all"]) or
                (len(query_lower.split()) <= 3 and any(cat_term in query_lower for cat_term in ["sports", "fitness", "electronics", "textbook", "clothing", "furniture"]))
            ):
                is_category_query = True
        
        # Merge with context if provided
        # For category queries, clear keywords
        if is_category_query:
            final_keywords = []
            logger.info(f"Fallback: Category-only query detected, clearing keywords")
        else:
            final_keywords = keywords if keywords else (context.get("keywords", []) if context else user_query.split())
        
        final_category = category if category else (context.get("category") if context else None)
        final_condition = condition if condition else (context.get("condition") if context else None)
        final_min_price = min_price if min_price else (context.get("min_price") if context else None)
        final_max_price = max_price if max_price else (context.get("max_price") if context else None)
        
        # Check if this is an "all [filter]" query - if so, clear keywords
        has_price_filter = final_min_price or final_max_price
        has_condition_filter = final_condition is not None
        
        is_all_query_explicit = (
            "show all" in query_lower or 
            query_lower.startswith("all ") or 
            "all " in query_lower or
            "all products" in query_lower or
            "all items" in query_lower
        )
        
        if (is_all_query_explicit and (final_category or has_price_filter or has_condition_filter)) or is_category_query:
            # "All" query with filters or category-only query - return empty keywords to get all items matching the filters
            final_keywords = []
            logger.info(f"'All' query or category query detected in fallback (category: {final_category}, price: {has_price_filter}, condition: {has_condition_filter}), clearing keywords")
        
        return {
            "keywords": final_keywords,  # Already handled category queries above
            "category": final_category,
            "condition": final_condition,
            "min_price": final_min_price,
            "max_price": final_max_price,
            "description": merged_query
        }
    
    client = get_openai_client()
    if not client:
        # Merge with context if provided
        final_keywords = user_query.split() if not context or not context.get("keywords") else context.get("keywords", [])
        return {
            "keywords": final_keywords,
            "category": context.get("category") if context else None,
            "condition": context.get("condition") if context else None,
            "min_price": context.get("min_price") if context else None,
            "max_price": context.get("max_price") if context else None,
            "description": merged_query
        }
    
    # Get available categories
    categories = [cat.value for cat in ItemCategory]
    conditions = [cond.value for cond in ItemCondition]
    
    # Create prompt for OpenAI
    system_prompt = """You are a search assistant for a campus marketplace. 
Extract search criteria from user queries and return JSON with the following structure:
{
    "keywords": ["list", "of", "important", "keywords"] or [],
    "category": "category_name" or null,
    "condition": "condition_name" or null,
    "min_price": number or null,
    "max_price": number or null,
    "description": "cleaned description",
    "query_type": "product" or "category" or "both"
}

Available categories: """ + ", ".join(categories) + """
Available conditions: """ + ", ".join(conditions) + """

CRITICAL INSTRUCTIONS - DISTINGUISHING PRODUCTS vs CATEGORIES:

**PRODUCT QUERIES** (query_type: "product"):
- User is looking for a SPECIFIC product/item: "tennis rackets", "laptop", "iPhone", "gloves", "textbook"
- Extract the product name as keywords: ["racket"], ["laptop"], ["iPhone"], ["gloves"], ["textbook"]
- Set category to null (unless explicitly mentioned)
- Examples:
  * "tennis rackets" → keywords: ["racket"], category: null, query_type: "product"
  * "laptop under 500" → keywords: ["laptop"], category: null, max_price: 500, query_type: "product"
  * "woollen gloves" → keywords: ["gloves"], category: null, query_type: "product"
  * "iPhone 15" → keywords: ["iPhone", "15"], category: null, query_type: "product"

**CATEGORY QUERIES** (query_type: "category"):
- User is looking for ALL items in a CATEGORY: "sports equipment", "electronics", "textbooks", "clothing"
- Set keywords to EMPTY ARRAY [] to return all items in that category
- Extract the category name
- Examples:
  * "sports equipment" → keywords: [], category: "sports_fitness", query_type: "category"
  * "electronics" → keywords: [], category: "electronics", query_type: "category"
  * "textbooks" → keywords: [], category: "textbooks", query_type: "category"
  * "show all sports equipment" → keywords: [], category: "sports_fitness", query_type: "category"
  * "all electronics" → keywords: [], category: "electronics", query_type: "category"

**COMBINED QUERIES** (query_type: "both"):
- User mentions both a category AND a specific product: "tennis rackets in sports equipment"
- Extract both keywords AND category
- Examples:
  * "laptop in electronics" → keywords: ["laptop"], category: "electronics", query_type: "both"

CATEGORY MAPPING:
- "sports", "sports equipment", "fitness", "athletic", "exercise", "gym" → category: "sports_fitness"
- "electronics", "tech", "technology", "devices" → category: "electronics"
- "textbook", "book", "textbooks", "books" → category: "textbooks"
- "clothing", "clothes", "apparel", "wear" → category: "clothing"
- "furniture", "furnishings" → category: "furniture"
- "other", "misc", "miscellaneous" → category: "other"

KEYWORD EXTRACTION RULES (for product queries only):
1. Extract ONLY the main product/item name. Ignore descriptive adjectives unless part of the product name.
2. "woollen gloves" → ["gloves"] (not ["woollen", "gloves"])
3. "red iPhone" → ["iPhone"] (not ["red", "iPhone"])
4. "used laptop" → ["laptop"] (not ["used", "laptop"])
5. Only include adjectives if essential: "iPhone 15" → ["iPhone", "15"]
6. CORRECT COMMON TYPOS: "tenis" → "tennis", "rakcet" → "racket", "laptp" → "laptop"

CONDITION EXTRACTION:
- "new" → condition: "new"
- "used" or "second-hand" → condition: "good" or "fair" (infer from context)
- "like new" or "almost new" → condition: "like_new"
- "good condition" → condition: "good"
- "fair condition" → condition: "fair"
- "poor condition" → condition: "poor"

PRICE EXTRACTION:
- "under 50" or "below 50" or "less than 50" → max_price: 50
- "over 100" or "above 100" or "more than 100" → min_price: 100
- "between 20 and 50" → min_price: 20, max_price: 50
- "$50" or "50 dollars" → max_price: 50 (if context suggests upper limit)

Return only valid JSON, no additional text."""

    # Build context-aware prompt
    context_info = ""
    if context:
        context_keywords = context.get("keywords", [])
        context_category = context.get("category")
        context_condition = context.get("condition")
        context_min_price = context.get("min_price")
        context_max_price = context.get("max_price")
        
        context_parts = []
        if context_keywords:
            context_parts.append(f"Previous search was for: {', '.join(context_keywords)}")
        if context_category:
            context_parts.append(f"Category: {context_category}")
        if context_condition:
            context_parts.append(f"Condition: {context_condition}")
        if context_min_price or context_max_price:
            price_range = []
            if context_min_price:
                price_range.append(f"min: ${context_min_price}")
            if context_max_price:
                price_range.append(f"max: ${context_max_price}")
            context_parts.append(f"Price: {', '.join(price_range)}")
        
        if context_parts:
            context_info = f"\n\nCONTEXT (previous search): {'; '.join(context_parts)}\nIf the user query refers to 'ones', 'those', 'them', 'it', etc., apply the new filters to the previous search criteria."
    
    user_prompt = f"User query: {merged_query}{context_info}\n\nExtract search criteria:"
    
    try:
        response = client.chat.completions.create(
            model=settings.openai_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.3,  # Lower temperature for more consistent extraction
            max_tokens=200
        )
        
        content = response.choices[0].message.content.strip()
        
        # Try to parse JSON response
        try:
            # Remove markdown code blocks if present
            if content.startswith("```json"):
                content = content[7:]
            if content.startswith("```"):
                content = content[3:]
            if content.endswith("```"):
                content = content[:-3]
            content = content.strip()
            
            criteria = json.loads(content)
            
            # Handle query_type to determine if this is a product or category query
            query_type = criteria.get("query_type", "product")
            extracted_category = criteria.get("category")
            
            # Additional check: if the query contains a category name, extract it and treat as category query if appropriate
            # This handles cases like "electronics", "textbooks", "show all sports equipment" where ChatGPT might not recognize it correctly
            query_lower_check = merged_query.lower().strip()
            
            # Check if query contains "show all" or "all" with a category
            if "show all" in query_lower_check or query_lower_check.startswith("all "):
                # Try to extract category from the query (e.g., "show all sports equipment" -> "sports equipment")
                # Remove "show all" or "all" and check what remains
                remaining_query = query_lower_check.replace("show all", "").replace("all ", "").strip()
                mapped_category = map_category_name_to_enum(remaining_query)
                if mapped_category:
                    query_type = "category"
                    criteria["category"] = mapped_category
                    criteria["keywords"] = []
                    logger.info(f"Query '{query_lower_check}' contains 'show all/all' with category '{mapped_category}', treating as category query")
            
            # Also check if the query is exactly a category name
            mapped_category = map_category_name_to_enum(query_lower_check)
            if mapped_category and not query_type == "category":
                # Query maps to a category name - check if it's exactly the category (not a product in that category)
                # If the query is just the category name (1-2 words), treat as category query
                query_words = query_lower_check.split()
                if len(query_words) <= 2 and mapped_category == extracted_category:
                    # Query is exactly a category name, treat as category query
                    query_type = "category"
                    criteria["category"] = mapped_category
                    criteria["keywords"] = []
                    logger.info(f"Query '{query_lower_check}' is exactly category name '{mapped_category}', treating as category query")
                elif extracted_category and mapped_category == extracted_category and len(query_words) <= 3:
                    # Query maps to category and is short, likely a category query
                    query_type = "category"
                    criteria["keywords"] = []
                    logger.info(f"Query '{query_lower_check}' maps to category '{mapped_category}', treating as category query")
            
            # If query_type is "category", ensure keywords are empty
            if query_type == "category":
                criteria["keywords"] = []
                logger.info(f"Category query detected, clearing keywords")
            # If query_type is "both", keep both keywords and category
            elif query_type == "both":
                logger.info(f"Combined query detected, keeping both keywords and category")
            # If query_type is "product" or not specified, keep keywords as is
            
            # Filter out common stop words and focus on product names (only for product queries)
            raw_keywords = criteria.get("keywords", [])
            filtered_keywords = []
            
            if query_type != "category" and raw_keywords:
                stop_words = {
                    "a", "an", "the", "i", "want", "need", "looking", "for", "under", "over", 
                    "above", "below", "less", "more", "than", "dollars", "dollar", "$", 
                    "woollen", "woolen", "wool", "used", "new", "old", "red", "blue", "green",
                    "black", "white", "small", "large", "big", "little"
                }
                # Remove stop words, correct typos, and keep only meaningful product-related keywords
                filtered_keywords = [
                    correct_common_typos(kw.lower().strip())
                    for kw in raw_keywords 
                    if kw.lower().strip() not in stop_words and len(kw.strip()) > 2
                ]
            
            # Prioritize: If we have multiple keywords, prefer the product name over descriptive words
            # For "woollen gloves", we want ["gloves"] not ["woollen", "gloves"]
            if len(filtered_keywords) > 1:
                # Common product/item words that should be prioritized
                product_keywords = {"gloves", "laptop", "phone", "iphone", "textbook", "book", 
                                   "racket", "rackets", "tennis", "shoes", "bag", "backpack", "chair", 
                                   "table", "desk", "bike", "bicycle", "car", "calculator"}
                
                # Check if any keyword is a known product name
                product_matches = [kw for kw in filtered_keywords if kw in product_keywords]
                
                if product_matches:
                    # Prioritize longer/more specific product names (e.g., "rackets" over "tennis")
                    product_matches.sort(key=len, reverse=True)
                    filtered_keywords = [product_matches[0]]
                    logger.info(f"Multiple keywords detected, using product keyword: {filtered_keywords}")
                else:
                    # If no known product, use the longest keyword
                    filtered_keywords.sort(key=len, reverse=True)
                    filtered_keywords = [filtered_keywords[0]]
                    logger.info(f"Multiple keywords detected, using longest keyword: {filtered_keywords}")
            
            # If we have filtered keywords, use them; otherwise use original
            # For category queries, keywords should already be empty from query_type handling above
            final_keywords = filtered_keywords if filtered_keywords else raw_keywords
            
            # Additional check: if query_type is "category", ensure keywords are empty
            if query_type == "category":
                final_keywords = []
            
            # Check if this is an "all [filter]" query - if so, clear keywords to return all matching items
            query_lower = merged_query.lower()
            extracted_category = criteria.get("category")
            has_price_filter = criteria.get("min_price") or criteria.get("max_price")
            has_condition_filter = criteria.get("condition")
            
            # Detect "all" queries: "all products", "show all", "all [category]", "all [condition]", "all [price range]"
            is_all_query_explicit = (
                "show all" in query_lower or 
                query_lower.startswith("all ") or 
                "all " in query_lower or
                "all products" in query_lower or
                "all items" in query_lower
            )
            
            # Also treat category-only queries (e.g., "sports equipment", "electronics") as "all" queries
            # If category is extracted and query contains generic category words, treat as category-only
            # Also check if the query is exactly a category name
            is_category_only = False
            if extracted_category:
                # Check if query is exactly the category name
                mapped_category = map_category_name_to_enum(query_lower.strip())
                if mapped_category == extracted_category:
                    is_category_only = True
                    logger.info(f"Query '{query_lower}' is exactly category name '{extracted_category}', treating as category query")
                elif (
                    is_all_query_explicit or
                    any(term in query_lower for term in ["equipment", "items", "products", "stuff", "things"]) or
                    (len(query_lower.split()) <= 3 and any(cat_term in query_lower for cat_term in ["sports", "fitness", "electronics", "textbook", "clothing", "furniture"]))
                ):
                    is_category_only = True
            
            if (is_all_query_explicit and (extracted_category or has_price_filter or has_condition_filter)) or is_category_only or query_type == "category":
                # "All" query with filters or category-only query - clear keywords to return all items matching the filters
                final_keywords = []
                logger.info(f"'All' query or category-only query detected (category: {extracted_category}, price: {has_price_filter}, condition: {has_condition_filter}, query_type: {query_type}), clearing keywords")
            
            # Merge with context: use new values if provided, otherwise keep context values
            # Also try to map category name to enum value
            raw_category = criteria.get("category")
            if raw_category:
                # Try to map natural language to category enum
                mapped_category = map_category_name_to_enum(raw_category)
                if mapped_category and mapped_category in categories:
                    merged_category = mapped_category
                elif raw_category in categories:
                    merged_category = raw_category
                else:
                    merged_category = context.get("category") if context else None
            else:
                merged_category = context.get("category") if context else None
            merged_condition = criteria.get("condition") if criteria.get("condition") in conditions else (context.get("condition") if context else None)
            merged_min_price = float(criteria["min_price"]) if criteria.get("min_price") else (context.get("min_price") if context else None)
            merged_max_price = float(criteria["max_price"]) if criteria.get("max_price") else (context.get("max_price") if context else None)
            
            # For keywords: if new query has keywords, use them; otherwise use context keywords
            # But if query has reference words, merge context keywords
            # Also check if this is an "all [filter]" query or category-only query
            query_lower_check = merged_query.lower()
            has_price_filter = merged_min_price or merged_max_price
            has_condition_filter = merged_condition is not None
            
            is_all_query_explicit = (
                "show all" in query_lower_check or 
                query_lower_check.startswith("all ") or 
                "all " in query_lower_check or
                "all products" in query_lower_check or 
                "all items" in query_lower_check
            )
            
            # Also treat category-only queries (e.g., "sports equipment", "electronics") as "all" queries
            is_category_only_query = merged_category and (
                is_all_query_explicit or
                # Check if query is primarily about the category
                any(term in query_lower_check for term in ["equipment", "items", "products", "stuff", "things"]) or
                # If query is just the category name or category + generic words (max 3 words)
                (len(query_lower_check.split()) <= 3 and any(cat_term in query_lower_check for cat_term in ["sports", "fitness", "electronics", "textbook", "clothing", "furniture"]))
            )
            
            is_all_query_with_filters = (
                (is_all_query_explicit and (merged_category or has_price_filter or has_condition_filter)) or
                is_category_only_query
            )
            
            reference_words = {"ones", "those", "them", "it", "these", "that", "this"}
            query_lower = user_query.lower()
            has_reference = any(ref in query_lower for ref in reference_words)
            
            if is_all_query_with_filters:
                # "All" query with filters - clear keywords to return all items matching the filters
                merged_keywords = []
                logger.info(f"'All' query with filters detected (category: {merged_category}, price: {has_price_filter}, condition: {has_condition_filter}), clearing keywords")
            elif has_reference and context and context.get("keywords"):
                # User is referring to previous search, use context keywords
                merged_keywords = context.get("keywords", final_keywords)
            else:
                # Use new keywords if available, otherwise context keywords
                merged_keywords = final_keywords if final_keywords else (context.get("keywords", []) if context else [])
            
            # Validate and clean criteria
            validated_criteria = {
                "keywords": merged_keywords,
                "category": merged_category,
                "condition": merged_condition,
                "min_price": merged_min_price,
                "max_price": merged_max_price,
                "description": criteria.get("description", merged_query)
            }
            
            logger.info(f"Extracted search criteria: {validated_criteria}")
            return validated_criteria
            
        except json.JSONDecodeError as e:
            logger.error(f"Failed to parse OpenAI response as JSON: {e}")
            logger.error(f"Response content: {content}")
            # Fallback to basic keyword extraction with stop word filtering
            stop_words = {"a", "an", "the", "i", "want", "need", "looking", "for", "under", "over", "above", "below", "less", "more", "than", "dollars", "dollar", "$", "woollen", "woolen", "wool"}
        # Note: "used", "new", "old" are NOT in stop_words - they are conditions that should be extracted
            keywords = [correct_common_typos(kw.lower().strip()) for kw in user_query.split() if kw.lower().strip() not in stop_words and len(kw.strip()) > 2]
            
            # If multiple keywords, prefer product names
            if len(keywords) > 1:
                product_keywords = {"gloves", "laptop", "phone", "iphone", "textbook", "book", 
                                   "racket", "rackets", "tennis", "shoes", "bag", "backpack", "chair", 
                                   "table", "desk", "bike", "bicycle", "car", "calculator"}
                product_matches = [kw for kw in keywords if kw in product_keywords]
                if product_matches:
                    # Prioritize longer/more specific product names
                    product_matches.sort(key=len, reverse=True)
                    keywords = [product_matches[0]]
            
            # Extract price and condition
            min_price, max_price, condition = extract_price_and_condition(user_query)
            
            return {
                "keywords": keywords if keywords else user_query.split(),
                "category": None,
                "condition": condition,
                "min_price": min_price,
                "max_price": max_price,
                "description": user_query
            }
            
    except Exception as e:
        logger.error(f"Error calling OpenAI API: {e}")
        # Fallback to basic keyword extraction with stop word filtering
        stop_words = {"a", "an", "the", "i", "want", "need", "looking", "for", "under", "over", "above", "below", "less", "more", "than", "dollars", "dollar", "$", "woollen", "woolen", "wool"}
        # Note: "used", "new", "old" are NOT in stop_words - they are conditions that should be extracted
        keywords = [correct_common_typos(kw.lower().strip()) for kw in user_query.split() if kw.lower().strip() not in stop_words and len(kw.strip()) > 2]
        
        # If multiple keywords, prefer product names
        if len(keywords) > 1:
            product_keywords = {"gloves", "laptop", "phone", "iphone", "textbook", "book", 
                               "racket", "rackets", "tennis", "shoes", "bag", "backpack", "chair", 
                               "table", "desk", "bike", "bicycle", "car", "calculator"}
            product_matches = [kw for kw in keywords if kw in product_keywords]
            if product_matches:
                keywords = [product_matches[0]]
        
        # Extract price and condition
        min_price, max_price, condition = extract_price_and_condition(user_query)
        
        return {
            "keywords": keywords if keywords else user_query.split(),  # Fallback to all words if filtering removes everything
            "category": None,
            "condition": condition,
            "min_price": min_price,
            "max_price": max_price,
            "description": user_query
        }


def find_similar_items_by_semantics(
    user_query: str, 
    items: List[Dict],
    top_k: int = 10
) -> List[Dict]:
    """
    Use OpenAI embeddings to find semantically similar items
    
    This approach compares the semantic meaning of the query with item descriptions
    """
    if not settings.openai_api_key:
        logger.warning("OpenAI API key not configured for semantic search")
        # Without API key, can't do semantic search - return empty or filter by keywords
        # This should not happen if pre-filtering is done correctly, but as safety:
        return []
    
    client = get_openai_client()
    if not client:
        # Client creation failed - return empty
        return []
    
    try:
        # Generate embedding for user query
        query_embedding_response = client.embeddings.create(
            model="text-embedding-3-small",
            input=user_query
        )
        query_embedding = query_embedding_response.data[0].embedding
        
        # Generate embeddings for all items (description + title)
        item_texts = [
            f"{item.get('title', '')} {item.get('description', '')}" 
            for item in items
        ]
        
        item_embeddings_response = client.embeddings.create(
            model="text-embedding-3-small",
            input=item_texts
        )
        item_embeddings = [data.embedding for data in item_embeddings_response.data]
        
        # Calculate cosine similarity
        import numpy as np
        
        query_vec = np.array(query_embedding)
        similarities = []
        
        for i, item_embedding in enumerate(item_embeddings):
            item_vec = np.array(item_embedding)
            # Cosine similarity
            similarity = np.dot(query_vec, item_vec) / (np.linalg.norm(query_vec) * np.linalg.norm(item_vec))
            similarities.append((i, similarity))
        
        # Sort by similarity (descending)
        similarities.sort(key=lambda x: x[1], reverse=True)
        
        # Return top_k most similar items
        top_items = [items[idx] for idx, _ in similarities[:top_k]]
        
        logger.info(f"Found {len(top_items)} semantically similar items")
        return top_items
        
    except Exception as e:
        logger.error(f"Error in semantic search: {e}")
        return items[:top_k]

