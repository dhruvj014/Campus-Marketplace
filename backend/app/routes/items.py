"""
Item management routes for marketplace listings with role-based access
"""

import logging
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import text, or_
from typing import List, Optional

from ..database import get_db
from ..models.item import Item
from ..models.user import User
from ..models.item_report import ItemReport
from ..schemas.item import ItemCreate, ItemUpdate, ItemResponse, ItemFilter, AISearchRequest, ItemReportCreate
from ..auth.dependencies import (
    get_current_active_user, require_admin
)
from ..enums.item import ItemStatus, ItemCategory, ItemCondition
from ..enums.user import UserRole
from ..utils.ai_search import extract_search_criteria, find_similar_items_by_semantics

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/", response_model=ItemResponse)
def create_item(
    item_data: ItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)  # Any user can create items
):
    """
    Create a new marketplace item (any authenticated user)
    """
    try:
        item_dict = item_data.dict()
        # Ensure status is set to AVAILABLE if not provided
        if 'status' not in item_dict:
            item_dict['status'] = ItemStatus.AVAILABLE
        
        db_item = Item(
            **item_dict,
            seller_id=current_user.id,
            created_by=current_user.username
        )
        db.add(db_item)
        db.commit()
        db.refresh(db_item)
        return db_item
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create item: {str(e)}"
        )


@router.get("/", response_model=List[ItemResponse])
def get_items(
    skip: int = 0,
    limit: int = 20,
    category: Optional[ItemCategory] = None,
    condition: Optional[ItemCondition] = None,
    status: Optional[ItemStatus] = None,
    min_price: Optional[float] = None,
    max_price: Optional[float] = None,
    search: Optional[str] = None,
    seller_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """
    Get marketplace items with filtering (public endpoint)
    """
    query = db.query(Item)
    
    # Always exclude removed items from public view
    query = query.filter(Item.status != ItemStatus.REMOVED)
    
    # Default to only showing available items for public view
    if status is None:
        query = query.filter(Item.status == ItemStatus.AVAILABLE)
    else:
        # Don't allow filtering by REMOVED status in public endpoint
        if status != ItemStatus.REMOVED:
            query = query.filter(Item.status == status)
    
    if category:
        query = query.filter(Item.category == category)
    if condition:
        query = query.filter(Item.condition == condition)
    if seller_id:
        query = query.filter(Item.seller_id == seller_id)
    if min_price is not None:
        query = query.filter(Item.price >= min_price)
    if max_price is not None:
        query = query.filter(Item.price <= max_price)
    if search:
        search_term = f"%{search}%"
        query = query.filter(
            (Item.title.ilike(search_term)) | 
            (Item.description.ilike(search_term))
        )
    
    items = query.offset(skip).limit(limit).all()
    return items


@router.get("/my-items", response_model=List[ItemResponse])
def get_my_items(
    status: Optional[ItemStatus] = None,
    current_user: User = Depends(get_current_active_user),
    db: Session = Depends(get_db)
):
    """
    Get current user's items (any authenticated user)
    Excludes removed items unless explicitly requested
    """
    query = db.query(Item).filter(Item.seller_id == current_user.id)
    
    # Exclude removed items by default
    if status:
        # Only show removed items if explicitly requested
        query = query.filter(Item.status == status)
    else:
        # Default: exclude removed items
        query = query.filter(Item.status != ItemStatus.REMOVED)
    
    return query.all()


@router.get("/{item_id}", response_model=ItemResponse)
def get_item(item_id: int, db: Session = Depends(get_db)):
    """
    Get item by ID (public endpoint)
    Returns 404 if item is removed
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    
    return item


@router.put("/{item_id}", response_model=ItemResponse)
def update_item(
    item_id: int,
    item_update: ItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Update an item (only by owner or admin)
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check authorization
    if item.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, 
            detail="Not authorized to update this item"
        )
    
    # Update fields
    for field, value in item_update.dict(exclude_unset=True).items():
        setattr(item, field, value)
    
    item.updated_by = current_user.username
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/mark-sold")
def mark_item_sold(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Mark item as sold (owner or admin only)
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check authorization
    if item.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this item"
        )
    
    item.status = ItemStatus.SOLD
    item.updated_by = current_user.username
    db.commit()
    return {"message": "Item marked as sold"}


@router.post("/{item_id}/mark-incomplete")
def mark_item_incomplete(
    item_id: int,
    report_data: ItemReportCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Report item as incomplete - creates a report and notifies the seller via WebSocket.
    Does NOT change the item status directly.
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Don't allow sellers to report their own items
    if item.seller_id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot report your own listing"
        )
    
    # Validate report type
    valid_report_types = ["incomplete_info", "no_photos", "inappropriate", "other"]
    if report_data.report_type not in valid_report_types:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid report type. Must be one of: {', '.join(valid_report_types)}"
        )
    
    # Require description for "other" type
    if report_data.report_type == "other" and not report_data.description:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Description is required for 'other' report type"
        )
    
    # Check if there's already an unresolved report for this item
    existing_report = db.query(ItemReport).filter(
        ItemReport.item_id == item_id,
        ItemReport.is_resolved == False,
        ItemReport.is_dismissed == False
    ).first()
    
    if existing_report:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This item has already been reported as incomplete"
        )
    
    # Create snapshot of item at time of report
    item_snapshot = {
        "title": item.title,
        "description": item.description,
        "price": float(item.price),
        "condition": item.condition.value if hasattr(item.condition, 'value') else str(item.condition),
        "category": item.category.value if hasattr(item.category, 'value') else str(item.category),
        "location": item.location,
        "is_negotiable": item.is_negotiable,
        "item_url": item.item_url,
        "status": item.status.value if hasattr(item.status, 'value') else str(item.status),
    }
    
    # Create a new report
    report = ItemReport(
        item_id=item_id,
        reported_by_user_id=current_user.id,
        seller_id=item.seller_id,
        report_type=report_data.report_type,
        description=report_data.description,
        item_snapshot=item_snapshot,
        is_resolved=False,
        is_dismissed=False,
        created_by=current_user.username
    )
    db.add(report)
    db.commit()
    db.refresh(report)
    
    # Send WebSocket notification to seller (NOT the reporter)
    try:
        from ..routes.chat import send_notification_via_websocket
        from datetime import datetime
        import anyio
        
        # IMPORTANT: Send notification to the SELLER (item.seller_id), not the reporter (current_user.id)
        seller_id = item.seller_id
        logger.info(f"Sending item report notification to seller {seller_id} for item {item_id} (reported by user {current_user.id})")
        
        notification_data = {
            "item_id": item_id,
            "item_title": item.title,
            "report_id": report.id,
            "seller_id": seller_id,  # Include seller_id for frontend verification
            "message": "An anonymous user has reported your listing as incomplete",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        # Send notification asynchronously (if in async context, use asyncio)
        try:
            # Wrap notification data in the expected format
            wrapped_notification = {
                "type": "item_reported",
                "data": notification_data
            }
            # Send to SELLER, not reporter
            anyio.from_thread.run(send_notification_via_websocket, seller_id, wrapped_notification)
        except RuntimeError:
            # If we're already in async context, schedule directly
            import asyncio
            wrapped_notification = {
                "type": "item_reported",
                "data": notification_data
            }
            # Send to SELLER, not reporter
            asyncio.create_task(send_notification_via_websocket(seller_id, wrapped_notification))
    except Exception as e:
        logger.warning(f"Failed to send WebSocket notification to seller {item.seller_id}: {e}")
    
    return {"message": "Item reported as incomplete. The seller has been notified."}


@router.post("/reports/{report_id}/resolve")
def resolve_item_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Mark a report as resolved (seller clicked "Fix it")
    Does NOT automatically mark as fixed - admin needs to review changes first
    """
    report = db.query(ItemReport).filter(ItemReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Only the seller can resolve their own reports
    if report.seller_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to resolve this report"
        )
    
    # Get current item state
    item = db.query(Item).filter(Item.id == report.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Compare current item state with snapshot
    current_state = {
        "title": item.title,
        "description": item.description,
        "price": float(item.price),
        "condition": item.condition.value if hasattr(item.condition, 'value') else str(item.condition),
        "category": item.category.value if hasattr(item.category, 'value') else str(item.category),
        "location": item.location,
        "is_negotiable": item.is_negotiable,
        "item_url": item.item_url,
        "status": item.status.value if hasattr(item.status, 'value') else str(item.status),
    }
    
    # Calculate changes
    changes = {}
    if report.item_snapshot:
        for key, old_value in report.item_snapshot.items():
            new_value = current_state.get(key)
            if old_value != new_value:
                changes[key] = {
                    "old": old_value,
                    "new": new_value
                }
    
    # Seller acknowledges the report - DO NOT mark as resolved
    # Only admin can mark as fixed after reviewing changes
    # Just update the timestamp to track when seller acknowledged
    report.updated_by = current_user.username
    db.commit()
    
    return {
        "message": "Report acknowledged. Admin will review and mark as fixed if changes are satisfactory.",
        "changes": changes,
        "has_changes": len(changes) > 0
    }


@router.post("/reports/{report_id}/dismiss")
def dismiss_item_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Dismiss a report (seller clicked "Dismiss")
    """
    report = db.query(ItemReport).filter(ItemReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    # Only the seller can dismiss their own reports (unless admin)
    if report.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to dismiss this report"
        )
    
    report.is_dismissed = True
    report.dismissed_at = datetime.utcnow()
    report.updated_by = current_user.username
    db.commit()
    
    return {"message": "Report dismissed"}


@router.post("/reports/{report_id}/mark-fixed")
def mark_report_fixed(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Mark a report as fixed (admin only) - same as resolve but for admin
    """
    from ..enums.user import UserRole
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    report = db.query(ItemReport).filter(ItemReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.is_resolved = True
    report.resolved_at = datetime.utcnow()
    report.updated_by = current_user.username
    db.commit()
    
    return {"message": "Report marked as fixed"}


@router.post("/reports/{report_id}/notify-seller")
def notify_seller_about_report(
    report_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Send a notification to the seller about the report (admin only)
    """
    from ..enums.user import UserRole
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    
    report = db.query(ItemReport).filter(ItemReport.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    item = db.query(Item).filter(Item.id == report.item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Send WebSocket notification to seller
    try:
        from ..routes.chat import send_notification_via_websocket
        import anyio
        
        notification_data = {
            "item_id": item.id,
            "item_title": item.title,
            "report_id": report.id,
            "seller_id": item.seller_id,
            "message": "An admin has reviewed your listing report. Please check your listing.",
            "timestamp": datetime.utcnow().isoformat()
        }
        
        wrapped_notification = {
            "type": "item_reported",
            "data": notification_data
        }
        
        try:
            anyio.from_thread.run(send_notification_via_websocket, item.seller_id, wrapped_notification)
        except RuntimeError:
            import asyncio
            asyncio.create_task(send_notification_via_websocket(item.seller_id, wrapped_notification))
        
        logger.info(f"Admin {current_user.id} sent notification to seller {item.seller_id} about report {report_id}")
    except Exception as e:
        logger.warning(f"Failed to send notification to seller {item.seller_id}: {e}")
    
    return {"message": "Seller has been notified"}


@router.delete("/{item_id}")
def delete_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_active_user)
):
    """
    Delete an item (owner or admin only) - soft delete by marking as REMOVED
    """
    item = db.query(Item).filter(Item.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Check authorization
    if item.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this item"
        )
    
    # Soft delete by changing status
    # Use direct SQL update to bypass SQLAlchemy enum conversion issue
    # The database enum expects lowercase 'removed', not 'REMOVED'
    db.execute(
        text("UPDATE items SET status = 'removed', updated_by = :updated_by, updated_at = now() WHERE id = :item_id"),
        {"item_id": item_id, "updated_by": current_user.username}
    )
    db.commit()
    
    return {"message": "Item deleted successfully"}


@router.post("/ai-search")
def ai_search_items(
    search_request: AISearchRequest,
    db: Session = Depends(get_db),
):
    """
    AI-assisted natural language search for marketplace items.
    Public endpoint that supports optional semantic re-ranking.
    """
    query_text = (search_request.query or "").strip()
    if not query_text:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Query cannot be empty")

    context_dict = search_request.context.model_dump(exclude_none=True) if search_request.context else None
    
    logger.info(f"=== AI SEARCH REQUEST ===")
    logger.info(f"User Query: '{query_text}'")
    logger.info(f"Context: {context_dict}")

    try:
        criteria = extract_search_criteria(query_text, context_dict)
        extraction_method = criteria.get('extraction_method', 'Unknown')
        logger.info(f"=== EXTRACTION RESULT ({extraction_method}) ===")
        logger.info(f"Product Names: {criteria.get('product_names', [])}")
        logger.info(f"Category: {criteria.get('category')}")
        logger.info(f"Condition: {criteria.get('condition')}")
        logger.info(f"Min Price: {criteria.get('min_price')}")
        logger.info(f"Max Price: {criteria.get('max_price')}")
        logger.info(f"Description: {criteria.get('description')}")
        logger.info(f"Extraction Method: {extraction_method}")
    except Exception as exc:
        logger.error(f"Failed to extract search criteria: {exc}", exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to process AI search query: {exc}",
        ) from exc

    base_query = db.query(Item).filter(Item.status != ItemStatus.REMOVED)
    # Show available/reserved items to end users
    base_query = base_query.filter(Item.status.in_([ItemStatus.AVAILABLE, ItemStatus.RESERVED]))
    
    logger.info(f"=== BASE QUERY FILTERS ===")
    logger.info(f"Status filter: AVAILABLE or RESERVED")

    # Track which filters are applied
    category_filter_applied = False
    condition_filter_applied = False
    price_filter_applied = False
    
    category_value = criteria.get("category")
    if category_value:
        try:
            base_query = base_query.filter(Item.category == ItemCategory(category_value))
            category_filter_applied = True
            logger.info(f"Category filter applied: {category_value}")
        except ValueError:
            # Ignore invalid categories returned by AI
            logger.warning(f"Invalid category value: {category_value}")
            pass
    else:
        logger.info(f"No category filter applied")

    condition_value = criteria.get("condition")
    if condition_value:
        try:
            condition_enum = ItemCondition(condition_value)
            base_query = base_query.filter(Item.condition == condition_enum)
            condition_filter_applied = True
            logger.info(f"Condition filter applied: {condition_value}")
        except ValueError:
            logger.warning(f"Invalid condition value: {condition_value}")
            pass
    else:
        logger.info(f"No condition filter applied")

    min_price = criteria.get("min_price")
    max_price = criteria.get("max_price")
    if min_price is not None and max_price is not None and min_price > max_price:
        min_price, max_price = max_price, min_price
        logger.info(f"Price range swapped: min={min_price}, max={max_price}")
    if min_price is not None:
        base_query = base_query.filter(Item.price >= min_price)
        price_filter_applied = True
        logger.info(f"Min price filter applied: ${min_price}")
    if max_price is not None:
        base_query = base_query.filter(Item.price <= max_price)
        price_filter_applied = True
        logger.info(f"Max price filter applied: ${max_price}")
    if min_price is None and max_price is None:
        logger.info(f"No price filter applied")

    # Get product names (with variations) from AI extraction
    # ChatGPT already corrected spelling and provided variations
    product_names = criteria.get("product_names", [])
    
    logger.info(f"=== PRODUCT NAME SEARCH ===")
    logger.info(f"Product names to search: {product_names}")
    
    # Build query with product name variations
    # Search for any of the product name variations in title or description
    product_query = base_query
    if product_names:
        # Create OR conditions for all product name variations
        product_conditions = []
        for product_name in product_names:
            like_pattern = f"%{product_name}%"
            product_conditions.append(
                or_(Item.title.ilike(like_pattern), Item.description.ilike(like_pattern))
            )
            logger.info(f"  - Searching for: '{product_name}' (pattern: {like_pattern})")
        
        # Combine all conditions with OR (using sqlalchemy.or_)
        if product_conditions:
            from sqlalchemy import or_ as sql_or
            product_query = product_query.filter(sql_or(*product_conditions))
            logger.info(f"Applied product name filter with {len(product_conditions)} variations")
    else:
        # No product names - this is a category-only query
        # Return all items matching category/condition/price filters
        product_query = base_query
        logger.info(f"No product names provided - this is a category-only query")

    # Log the SQL query being constructed
    logger.info(f"=== SQL QUERY CONSTRUCTION ===")
    try:
        # Try to compile the query to see what SQL will be executed
        compiled = product_query.statement.compile(compile_kwargs={'literal_binds': False})
        logger.info(f"Query SQL (compiled): {compiled}")
    except Exception as e:
        logger.info(f"Could not compile query for logging: {e}")
        logger.info(f"Query filters applied: product_names={product_names}, category={category_value}, condition={condition_value}, price_range=[{min_price}, {max_price}]")

    limit = 50
    items = product_query.order_by(Item.created_at.desc()).limit(limit).all()
    
    logger.info(f"=== QUERY RESULTS (Initial) ===")
    logger.info(f"Found {len(items)} items")
    if items:
        for idx, item in enumerate(items[:5]):  # Log first 5 items
            logger.info(f"  [{idx+1}] ID: {item.id}, Title: '{item.title}', Category: {item.category}, Condition: {item.condition}, Price: ${item.price}")

    # If no matches found and condition filter was applied, try relaxing the condition filter
    if len(items) == 0 and condition_filter_applied and condition_value and product_names:
        logger.info(f"No items found with condition '{condition_value}'. Trying to relax condition filter...")
        
        # Map of condition to related conditions
        # "used" items can be like_new, good, fair, or poor (anything except new)
        # "new" items can be new or like_new
        condition_relaxations = {
            "good": ["like_new", "good", "fair", "poor"],  # Used items - include like_new too
            "fair": ["like_new", "good", "fair", "poor"],
            "poor": ["like_new", "good", "fair", "poor"],
            "new": ["new", "like_new"],  # New items
            "like_new": ["new", "like_new"]
        }
        
        # Try related conditions
        related_conditions = condition_relaxations.get(condition_value, [])
        if related_conditions:
            # Remove condition filter and try with related conditions
            base_query_no_condition = db.query(Item).filter(Item.status != ItemStatus.REMOVED)
            base_query_no_condition = base_query_no_condition.filter(Item.status.in_([ItemStatus.AVAILABLE, ItemStatus.RESERVED]))
            
            # Reapply other filters
            if category_value:
                try:
                    base_query_no_condition = base_query_no_condition.filter(Item.category == ItemCategory(category_value))
                except ValueError:
                    pass
            
            if min_price is not None:
                base_query_no_condition = base_query_no_condition.filter(Item.price >= min_price)
            if max_price is not None:
                base_query_no_condition = base_query_no_condition.filter(Item.price <= max_price)
            
            # Apply condition filter with related conditions
            base_query_no_condition = base_query_no_condition.filter(Item.condition.in_([ItemCondition(c) for c in related_conditions]))
            
            # Reapply product name search
            if product_names:
                product_conditions = []
                for product_name in product_names:
                    like_pattern = f"%{product_name}%"
                    product_conditions.append(
                        or_(Item.title.ilike(like_pattern), Item.description.ilike(like_pattern))
                    )
                if product_conditions:
                    from sqlalchemy import or_ as sql_or
                    base_query_no_condition = base_query_no_condition.filter(sql_or(*product_conditions))
            
            items = base_query_no_condition.order_by(Item.created_at.desc()).limit(limit).all()
            logger.info(f"After relaxing condition filter, found {len(items)} items")
            if items:
                for idx, item in enumerate(items[:5]):
                    logger.info(f"  [{idx+1}] ID: {item.id}, Title: '{item.title}', Condition: {item.condition}, Price: ${item.price}")

    # Track which filters were relaxed
    filters_relaxed = []
    
    # If still no matches found but we have product names, try removing filters one by one
    if len(items) == 0 and product_names and (condition_filter_applied or price_filter_applied or category_filter_applied):
        logger.info(f"No items found with all filters. Trying to relax filters and match by product name only...")
        
        # Build query with just product name, no filters
        base_query_product_only = db.query(Item).filter(Item.status != ItemStatus.REMOVED)
        base_query_product_only = base_query_product_only.filter(Item.status.in_([ItemStatus.AVAILABLE, ItemStatus.RESERVED]))
        
        # Don't apply any filters - just product name match
        # Apply product name search
        if product_names:
            product_conditions = []
            for product_name in product_names:
                like_pattern = f"%{product_name}%"
                product_conditions.append(
                    or_(Item.title.ilike(like_pattern), Item.description.ilike(like_pattern))
                )
            if product_conditions:
                from sqlalchemy import or_ as sql_or
                base_query_product_only = base_query_product_only.filter(sql_or(*product_conditions))
        
        items = base_query_product_only.order_by(Item.created_at.desc()).limit(limit).all()
        logger.info(f"After removing all filters, found {len(items)} items matching product name")
        if items:
            for idx, item in enumerate(items[:5]):
                logger.info(f"  [{idx+1}] ID: {item.id}, Title: '{item.title}', Category: {item.category}, Condition: {item.condition}, Price: ${item.price}")
            
            # Track which filters were relaxed
            if condition_filter_applied:
                filters_relaxed.append("condition")
            if price_filter_applied:
                filters_relaxed.append("price")
            if category_filter_applied:
                filters_relaxed.append("category")

    # If still no matches found but we have product names, return empty
    if len(items) == 0 and product_names:
        logger.warning(f"No items found for product names: {product_names}. Returning empty results.")
        return []

    if not items:
        return []

    # Optional semantic re-ranking
    if search_request.use_semantic_search:
        serialized_items = [
            {
                "id": item.id,
                "title": item.title or "",
                "description": item.description or "",
            }
            for item in items
        ]
        semantic_results = find_similar_items_by_semantics(
            criteria.get("description") or query_text,
            serialized_items,
            top_k=min(len(serialized_items), 10),
        )
        semantic_ids = [result.get("id") for result in semantic_results if result.get("id") is not None]
        if semantic_ids:
            item_map = {item.id: item for item in items}
            ordered_items = [item_map[item_id] for item_id in semantic_ids if item_id in item_map]
            ordered_items.extend([item for item in items if item.id not in semantic_ids])
            items = ordered_items

    # Convert items to ItemResponse models for proper serialization
    item_responses = [ItemResponse.model_validate(item) for item in items]
    
    # Build extracted criteria for response headers
    from fastapi import Response
    from fastapi.encoders import jsonable_encoder
    from ..schemas.item import AISearchContext
    import json
    
    extracted_criteria = AISearchContext(
        product_names=criteria.get("product_names", []),
        category=criteria.get("category"),
        condition=criteria.get("condition"),
        min_price=criteria.get("min_price"),
        max_price=criteria.get("max_price")
    )
    
    # Check which filters were actually matched in the results
    filters_not_matched = []
    
    if len(items) > 0:
        # Check if condition filter was matched
        if condition_filter_applied and condition_value:
            requested_condition = ItemCondition(condition_value)
            items_with_condition = [item for item in items if item.condition == requested_condition]
            if len(items_with_condition) == 0:
                filters_not_matched.append("condition")
                logger.info(f"Condition filter not matched - found {len(items)} items but none with condition '{condition_value}'")
        
        # Check if price filter was matched
        if price_filter_applied:
            items_within_price = []
            for item in items:
                price_match = True
                if min_price is not None and item.price < min_price:
                    price_match = False
                if max_price is not None and item.price > max_price:
                    price_match = False
                if price_match:
                    items_within_price.append(item)
            if len(items_within_price) == 0:
                filters_not_matched.append("price")
                logger.info(f"Price filter not matched - found {len(items)} items but none within price range")
        
        # Check if category filter was matched
        if category_filter_applied and category_value:
            try:
                requested_category = ItemCategory(category_value)
                items_with_category = [item for item in items if item.category == requested_category]
                if len(items_with_category) == 0:
                    filters_not_matched.append("category")
                    logger.info(f"Category filter not matched - found {len(items)} items but none in category '{category_value}'")
            except ValueError:
                pass
    
    # If filters were relaxed (removed to find items), add them to not_matched
    if filters_relaxed:
        filters_not_matched.extend([f for f in filters_relaxed if f not in filters_not_matched])
    
    # Serialize items to JSON
    item_dicts = jsonable_encoder(item_responses)
    
    # Return JSON response with extracted criteria in headers
    # Get extraction method from criteria
    extraction_method = criteria.get('extraction_method', 'Unknown')
    
    # Use Response with proper JSON serialization
    response_headers = {
        "X-Extracted-Criteria": json.dumps(extracted_criteria.model_dump(exclude_none=True)),
        "X-Extraction-Method": extraction_method
    }
    if filters_not_matched:
        response_headers["X-Filters-Relaxed"] = json.dumps(filters_not_matched)
        if "condition" in filters_not_matched and condition_value:
            response_headers["X-Requested-Condition"] = condition_value
        if "price" in filters_not_matched:
            price_info = {}
            if min_price is not None:
                price_info["min_price"] = min_price
            if max_price is not None:
                price_info["max_price"] = max_price
            if price_info:
                response_headers["X-Requested-Price"] = json.dumps(price_info)
        if "category" in filters_not_matched and category_value:
            response_headers["X-Requested-Category"] = category_value
    
    response = Response(
        content=json.dumps(item_dicts),
        media_type="application/json",
        headers=response_headers
    )
    
    return response


# Admin-only routes
@router.get("/admin/all", response_model=List[ItemResponse])
def get_all_items_admin(
    skip: int = 0,
    limit: int = 100,
    status: Optional[ItemStatus] = None,
    admin_user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """
    Get all items including removed ones (admin only)
    """
    query = db.query(Item)
    if status:
        query = query.filter(Item.status == status)
    
    return query.offset(skip).limit(limit).all()


