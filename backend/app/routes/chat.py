"""
Chat routes for messaging between users
"""

from fastapi import APIRouter, Depends, HTTPException, status, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_
from typing import List, Dict, Optional
import logging
import json
from datetime import datetime

from ..database import get_db
from ..models.chat import Conversation, Message
from ..models.notification import Notification, NotificationType
from ..models.user import User
from ..models.item import Item
from ..models.transaction import Transaction
from ..models.rating import Rating
from ..auth.dependencies import get_current_user
from ..core.logging import get_logger
from ..config import settings
from ..schemas.chat import MessageCreate, MessageResponse, ConversationResponse, ConversationCreate
from ..schemas.transaction import (
    TransactionCreate,
    TransactionResponse,
    RatingCreate,
    RatingResponse,
    TransactionDetailResponse,
    UserTransactionSummaryResponse,
)

router = APIRouter()

# Store active WebSocket connections
active_connections: Dict[int, WebSocket] = {}

# Module logger
logger = get_logger(__name__)


def log_confetti_event(
    event_user_id: int,
    role: str,
    conversation_id: int,
    transaction_id: int,
    item_id: int,
):
    """Log confetti dispatch metadata; only surface in full verbosity."""
    level = logging.INFO if settings.log_verbosity == "full" else logging.DEBUG
    message = (
        f"Confetti event queued for {role} "
        f"(user_id={event_user_id}) on conversation={conversation_id}, transaction={transaction_id}, item={item_id}"
    )
    logger.log(
        level,
        message,
        extra={
            "event": "confetti_dispatched",
            "user_id": event_user_id,
            "role": role,
            "conversation_id": conversation_id,
            "transaction_id": transaction_id,
            "item_id": item_id,
        },
    )


def create_notification(
    db: Session,
    user_id: int,
    notification_type: NotificationType,
    title: str,
    message: str,
    related_item_id: int = None,
    related_user_id: int = None,
    related_conversation_id: int = None
) -> Notification:
    """Create a notification in the database"""
    notification = Notification(
        user_id=user_id,
        type=notification_type,
        title=title,
        message=message,
        related_item_id=related_item_id,
        related_user_id=related_user_id,
        related_conversation_id=related_conversation_id,
        created_by="system"
    )
    db.add(notification)
    db.commit()
    db.refresh(notification)
    return notification


async def send_notification_via_websocket(user_id: int, notification_data: dict):
    """Send notification via WebSocket if user is connected"""
    if user_id in active_connections:
        try:
            await active_connections[user_id].send_json({
                "type": "notification",
                "data": notification_data
            })
        except Exception as e:
            print(f"Error sending notification via WebSocket: {e}")


async def broadcast_conversation_update(conversation: Conversation, db: Session):
    """Notify conversation participants that the conversation metadata changed"""
    try:
        item_title = None
        item_status = None
        item_price = None

        if conversation.item_id:
            item = db.query(Item).filter(Item.id == conversation.item_id).first()
            if item:
                item_title = item.title
                item_status = item.status
                item_price = item.price

        # Get transaction data if conversation is sold
        transaction_data = None
        if getattr(conversation, "transaction_id", None):
            transaction_obj = db.query(Transaction).filter(Transaction.id == conversation.transaction_id).first()
            if transaction_obj:
                transaction_data = serialize_transaction(transaction_obj)

        payload = {
            "conversation_id": conversation.id,
            "item_id": conversation.item_id,
            "is_sold": getattr(conversation, "is_sold", False),
            "is_ended": getattr(conversation, "is_ended", False),
            "transaction_id": getattr(conversation, "transaction_id", None),
            "transaction": transaction_data.model_dump() if transaction_data else None,
            "item_title": item_title,
            "item_status": item_status,
            "item_price": item_price,
            "updated_at": datetime.utcnow().isoformat()
        }

        for user_id in [conversation.user1_id, conversation.user2_id]:
            if user_id in active_connections:
                try:
                    await active_connections[user_id].send_json({
                        "type": "conversation_updated",
                        "data": payload
                    })
                except Exception as e:
                    print(f"Error sending conversation update via WebSocket: {e}")
    except Exception as exc:
        print(f"Failed to broadcast conversation update: {exc}")


def serialize_transaction(transaction: Transaction) -> TransactionResponse:
    return TransactionResponse(
        id=transaction.id,
        item_id=transaction.item_id,
        seller_id=transaction.seller_id,
        buyer_id=transaction.buyer_id,
        conversation_id=transaction.conversation_id,
        sale_price=transaction.sale_price,
        original_price=transaction.original_price,
        is_completed=transaction.is_completed,
        completed_at=transaction.completed_at,
        notes=transaction.notes,
        created_at=transaction.created_at
    )


def serialize_transaction_detail(transaction: Transaction) -> TransactionDetailResponse:
    return TransactionDetailResponse(
        id=transaction.id,
        item_id=transaction.item_id,
        conversation_id=transaction.conversation_id,
        item_title=transaction.item.title if transaction.item else None,
        seller_id=transaction.seller_id,
        seller_name=transaction.seller.full_name if transaction.seller else None,
        buyer_id=transaction.buyer_id,
        buyer_name=transaction.buyer.full_name if transaction.buyer else None,
        sale_price=transaction.sale_price,
        completed_at=transaction.completed_at
    )


@router.post("/conversations", response_model=ConversationResponse)
async def create_conversation(
    conversation_data: ConversationCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new conversation or return existing one"""
    user1_id = current_user.id
    user2_id = conversation_data.user2_id
    
    if user1_id == user2_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot create conversation with yourself"
        )
    
    # Check if user2 exists
    user2 = db.query(User).filter(User.id == user2_id).first()
    if not user2:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    # Check if conversation already exists
    existing = db.query(Conversation).filter(
        or_(
            and_(Conversation.user1_id == user1_id, Conversation.user2_id == user2_id),
            and_(Conversation.user1_id == user2_id, Conversation.user2_id == user1_id)
        )
    ).first()
    
    if existing:
        conversation_updated = False
        # Update item_id if a new item_id is provided and different from current
        if conversation_data.item_id and existing.item_id != conversation_data.item_id:
            existing.item_id = conversation_data.item_id
            # Auto-resume ended conversation when contacting same seller for different item
            if hasattr(existing, 'is_ended') and existing.is_ended:
                existing.is_ended = False
                existing.ended_at = None
            # Reset sale-related flags when switching to a different item
            if hasattr(existing, 'is_sold') and existing.is_sold:
                existing.is_sold = False
                existing.sold_at = None
                existing.transaction_id = None
            conversation_updated = True
            db.commit()
            db.refresh(existing)

            if conversation_updated:
                await broadcast_conversation_update(existing, db)
        
        # Return existing conversation
        other_user_id = user2_id if existing.user1_id == user1_id else existing.user1_id
        other_user = db.query(User).filter(User.id == other_user_id).first()
        
        # Get unread count
        unread_count = db.query(Message).filter(
            and_(
                Message.conversation_id == existing.id,
                Message.sender_id != user1_id,
                Message.is_read == False
            )
        ).count()
        
        # Get last message
        last_message = db.query(Message).filter(
            Message.conversation_id == existing.id
        ).order_by(Message.created_at.desc()).first()
        
        last_message_response = None
        if last_message:
            sender = db.query(User).filter(User.id == last_message.sender_id).first()
            last_message_response = MessageResponse(
                id=last_message.id,
                conversation_id=last_message.conversation_id,
                sender_id=last_message.sender_id,
                content=last_message.content,
                is_read=last_message.is_read,
                read_at=last_message.read_at,
                created_at=last_message.created_at,
                sender_username=sender.username if sender else None,
                sender_full_name=sender.full_name if sender else None
            )
        
        # Get transaction if exists
        transaction_response = None
        if hasattr(existing, 'transaction_id') and existing.transaction_id:
            transaction = db.query(Transaction).filter(Transaction.id == existing.transaction_id).first()
            if transaction:
                transaction_response = serialize_transaction(transaction)
        
        # Get status value (handle backward compatibility)
        status_value = "active"
        if hasattr(existing, 'user1_status') and hasattr(existing, 'user2_status'):
            if existing.user1_id == user1_id:
                status_value = existing.user1_status or "active"
            else:
                status_value = existing.user2_status or "active"
        
        pending_price = None
        if hasattr(existing, 'pending_offer_price') and existing.pending_offer_price:
            pending_price = existing.pending_offer_price / 100.0  # Convert from cents to dollars
        
        return ConversationResponse(
            id=existing.id,
            user1_id=existing.user1_id,
            user2_id=existing.user2_id,
            item_id=existing.item_id,
            last_message_at=existing.last_message_at,
            created_at=existing.created_at,
            other_user_id=other_user_id,
            other_user_username=other_user.username if other_user else "",
            other_user_full_name=other_user.full_name if other_user else "",
            unread_count=unread_count,
            last_message=last_message_response,
            status=status_value,
            is_sold=getattr(existing, 'is_sold', False),
            is_ended=getattr(existing, 'is_ended', False),
            transaction_id=getattr(existing, 'transaction_id', None),
            transaction=transaction_response,
            pending_offer_price=pending_price,
            pending_offer_from_user_id=getattr(existing, 'pending_offer_from_user_id', None),
            pending_offer_at=getattr(existing, 'pending_offer_at', None)
        )
    
    # Create new conversation
    conversation = Conversation(
        user1_id=user1_id,
        user2_id=user2_id,
        item_id=conversation_data.item_id,
        created_by=current_user.username
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    
    return ConversationResponse(
        id=conversation.id,
        user1_id=conversation.user1_id,
        user2_id=conversation.user2_id,
        item_id=conversation.item_id,
        last_message_at=conversation.last_message_at,
        created_at=conversation.created_at,
        other_user_id=user2_id,
        other_user_username=user2.username,
        other_user_full_name=user2.full_name,
        unread_count=0,
        last_message=None,
        pending_offer_price=None,
        pending_offer_from_user_id=None,
        pending_offer_at=None
    )


@router.get("/conversations", response_model=List[ConversationResponse])
def get_conversations(
    include_archived: bool = True,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all conversations for the current user"""
    # Build query based on user position
    query = db.query(Conversation).filter(
        or_(
            Conversation.user1_id == current_user.id,
            Conversation.user2_id == current_user.id
        )
    )
    
    conversations = query.order_by(Conversation.last_message_at.desc().nullslast(), Conversation.created_at.desc()).all()
    
    result = []
    for conv in conversations:
        # Get user's status (with fallback for backward compatibility)
        try:
            user_status = conv.user1_status if conv.user1_id == current_user.id else conv.user2_status
        except AttributeError:
            # Columns don't exist yet, treat as active
            user_status = "active"
        
        # Skip deleted conversations and archived if not requested
        if user_status == "deleted" or (user_status == "archived" and not include_archived):
            continue
            
        other_user_id = conv.user2_id if conv.user1_id == current_user.id else conv.user1_id
        other_user = db.query(User).filter(User.id == other_user_id).first()
        other_user_id = conv.user2_id if conv.user1_id == current_user.id else conv.user1_id
        other_user = db.query(User).filter(User.id == other_user_id).first()
        
        # Get unread count
        unread_count = db.query(Message).filter(
            and_(
                Message.conversation_id == conv.id,
                Message.sender_id != current_user.id,
                Message.is_read == False
            )
        ).count()
        
        # Get last message
        last_message = db.query(Message).filter(
            Message.conversation_id == conv.id
        ).order_by(Message.created_at.desc()).first()
        
        last_message_response = None
        if last_message:
            sender = db.query(User).filter(User.id == last_message.sender_id).first()
            last_message_response = MessageResponse(
                id=last_message.id,
                conversation_id=last_message.conversation_id,
                sender_id=last_message.sender_id,
                content=last_message.content,
                is_read=last_message.is_read,
                read_at=last_message.read_at,
                created_at=last_message.created_at,
                sender_username=sender.username if sender else None,
                sender_full_name=sender.full_name if sender else None
            )
        
        # Ensure status is returned
        try:
            status_value = user_status if user_status else "active"
        except:
            status_value = "active"
        
        # Get transaction if exists
        transaction_id = None
        transaction_data = None
        if hasattr(conv, 'transaction_id') and conv.transaction_id:
            transaction_id = conv.transaction_id
            transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
            if transaction:
                transaction_data = serialize_transaction(transaction)
        
        pending_price = None
        if hasattr(conv, 'pending_offer_price') and conv.pending_offer_price:
            pending_price = conv.pending_offer_price / 100.0  # Convert from cents to dollars
        
        # Get profile picture URL if available
        other_user_profile_picture = None
        if other_user:
            other_user_profile_picture = getattr(other_user, 'profile_picture_url', None)
        
        result.append(ConversationResponse(
            id=conv.id,
            user1_id=conv.user1_id,
            user2_id=conv.user2_id,
            item_id=conv.item_id,
            last_message_at=conv.last_message_at,
            created_at=conv.created_at,
            other_user_id=other_user_id,
            other_user_username=other_user.username if other_user else "",
            other_user_full_name=other_user.full_name if other_user else "",
            other_user_profile_picture_url=other_user_profile_picture,
            unread_count=unread_count,
            last_message=last_message_response,
            status=status_value,
            is_sold=getattr(conv, 'is_sold', False),
            is_ended=getattr(conv, 'is_ended', False),
            transaction_id=transaction_id,
            transaction=transaction_data,
            pending_offer_price=pending_price,
            pending_offer_from_user_id=getattr(conv, 'pending_offer_from_user_id', None),
            pending_offer_at=getattr(conv, 'pending_offer_at', None)
        ))
    
    return result


@router.get("/conversations/{conversation_id}/messages", response_model=List[MessageResponse])
async def get_messages(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all messages in a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this conversation"
        )
    
    messages = db.query(Message).filter(
        Message.conversation_id == conversation_id
    ).order_by(Message.created_at.asc()).all()
    
    # Mark messages as read
    unread_messages = [m for m in messages if not m.is_read and m.sender_id != current_user.id]
    notifications_updated = 0
    if unread_messages:
        now = datetime.utcnow()
        for msg in unread_messages:
            msg.is_read = True
            msg.read_at = now
        notifications_updated = db.query(Notification).filter(
            Notification.user_id == current_user.id,
            Notification.related_conversation_id == conversation_id,
            Notification.is_read == False
        ).update({
            "is_read": True,
            "read_at": now
        })
        db.commit()
    
    result = []
    for msg in messages:
        sender = db.query(User).filter(User.id == msg.sender_id).first()
        result.append(MessageResponse(
            id=msg.id,
            conversation_id=msg.conversation_id,
            sender_id=msg.sender_id,
            content=msg.content,
            is_read=msg.is_read,
            read_at=msg.read_at,
            created_at=msg.created_at,
            sender_username=sender.username if sender else None,
            sender_full_name=sender.full_name if sender else None
        ))
    
    if notifications_updated and current_user.id in active_connections:
        await active_connections[current_user.id].send_json({
            "type": "notifications_read",
            "data": {
                "conversation_id": conversation_id,
                "notifications_read": notifications_updated
            }
        })
    return result


@router.post("/messages", response_model=MessageResponse)
async def create_message(
    message_data: MessageCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Create a new message"""
    conversation = db.query(Conversation).filter(Conversation.id == message_data.conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to send messages in this conversation"
        )
    
    # Create message
    message = Message(
        conversation_id=message_data.conversation_id,
        sender_id=current_user.id,
        content=message_data.content,
        created_by=current_user.username
    )
    db.add(message)
    
    # Update conversation last_message_at
    conversation.last_message_at = datetime.utcnow()
    conversation.updated_by = current_user.username
    
    db.commit()
    db.refresh(message)
    
    # Get recipient
    recipient_id = conversation.user2_id if conversation.user1_id == current_user.id else conversation.user1_id
    
    # Send notification to recipient
    recipient = db.query(User).filter(User.id == recipient_id).first()
    notification = None
    if recipient:
        notification = create_notification(
            db=db,
            user_id=recipient_id,
            notification_type=NotificationType.MESSAGE,
            title="New Message",
            message=f"{current_user.full_name} sent you a message",
            related_conversation_id=conversation.id,
            related_user_id=current_user.id
        )
    
    # Send notification FIRST via WebSocket if created (for instant delivery)
    if notification and recipient_id in active_connections:
        try:
            await active_connections[recipient_id].send_json({
                "type": "notification",
                "data": {
                    "id": notification.id,
                    "type": notification.type.value,
                    "title": notification.title,
                    "message": notification.message,
                    "is_read": notification.is_read,
                    "created_at": notification.created_at.isoformat(),
                    "related_item_id": notification.related_item_id,
                    "related_user_id": notification.related_user_id,
                    "related_conversation_id": notification.related_conversation_id
                }
            })
        except Exception as e:
            print(f"Error sending notification via WebSocket: {e}")
    
    # Send message via WebSocket to recipient if connected (IMMEDIATELY)
    if recipient_id in active_connections:
        try:
            await active_connections[recipient_id].send_json({
                "type": "message",
                "data": {
                    "id": message.id,
                    "conversation_id": message.conversation_id,
                    "sender_id": message.sender_id,
                    "content": message.content,
                    "is_read": message.is_read,
                    "created_at": message.created_at.isoformat(),
                    "sender_username": current_user.username,
                    "sender_full_name": current_user.full_name
                }
            })
        except Exception as e:
            print(f"Error sending message via WebSocket: {e}")
    
    # Also send conversation update to both parties for instant UI refresh
    await broadcast_conversation_update(conversation, db)
    
    return MessageResponse(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        content=message.content,
        is_read=message.is_read,
        read_at=message.read_at,
        created_at=message.created_at,
        sender_username=current_user.username,
        sender_full_name=current_user.full_name
    )


@router.put("/conversations/{conversation_id}/archive")
def archive_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Archive a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to archive this conversation"
        )
    
    # Update status for the current user
    # Note: user1_status/user2_status fields are not yet in the database
    # This endpoint will work once those fields are added via migration
    if hasattr(conversation, 'user1_status') and hasattr(conversation, 'user2_status'):
        if conversation.user1_id == current_user.id:
            conversation.user1_status = "archived"
        else:
            conversation.user2_status = "archived"
    
    conversation.updated_by = current_user.username
    db.commit()
    
    return {"message": "Conversation archived"}


@router.put("/conversations/{conversation_id}/unarchive")
def unarchive_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Unarchive a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to unarchive this conversation"
        )
    
    # Update status for the current user
    # Note: user1_status/user2_status fields are not yet in the database
    # This endpoint will work once those fields are added via migration
    if hasattr(conversation, 'user1_status') and hasattr(conversation, 'user2_status'):
        if conversation.user1_id == current_user.id:
            conversation.user1_status = "active"
        else:
            conversation.user2_status = "active"
    
    conversation.updated_by = current_user.username
    db.commit()
    
    return {"message": "Conversation unarchived"}


@router.delete("/conversations/{conversation_id}")
def delete_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Delete a conversation for the current user"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this conversation"
        )
    
    # Since we don't have user1_status/user2_status fields yet,
    # we'll delete the conversation completely
    # Note: This will remove it for both users
    # TODO: When user1_status/user2_status fields are added, implement per-user deletion
    
    try:
        # First, remove references from notifications (set related_conversation_id to NULL)
        from app.models.notification import Notification
        db.query(Notification).filter(
            Notification.related_conversation_id == conversation_id
        ).update({Notification.related_conversation_id: None})
        
        # Remove references from transactions (set conversation_id to NULL)
        # This preserves transaction history but removes the conversation link
        from app.models.transaction import Transaction
        db.query(Transaction).filter(
            Transaction.conversation_id == conversation_id
        ).update({Transaction.conversation_id: None})
        
        # Delete the conversation (messages will cascade delete automatically)
        db.delete(conversation)
        db.commit()
    except Exception as e:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete conversation: {str(e)}"
        )
    
    return {"message": "Conversation deleted"}


@router.post("/conversations/{conversation_id}/report")
def report_conversation(
    conversation_id: int,
    reason: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Report a conversation"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to report this conversation"
        )
    
    # Mark conversation as reported
    conversation.is_reported = True
    conversation.reported_at = datetime.utcnow()
    conversation.reported_by = current_user.id
    conversation.report_reason = reason
    conversation.updated_by = current_user.username
    db.commit()
    
    return {"message": "Conversation reported successfully"}


@router.post("/conversations/{conversation_id}/offer", response_model=dict)
async def send_purchase_offer(
    conversation_id: int,
    transaction_data: TransactionCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Send a purchase offer (seller or buyer can initiate)"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to send offers in this conversation"
        )
    
    # Get item from conversation
    if not conversation.item_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Conversation is not associated with an item"
        )
    
    item = db.query(Item).filter(Item.id == conversation.item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    # Get the other user in the conversation
    other_user_id = conversation.user2_id if conversation.user1_id == current_user.id else conversation.user1_id
    is_seller = item.seller_id == current_user.id
    
    # Check if already sold
    if conversation.is_sold:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Item already sold in this conversation"
        )
    
    # Set pending offer
    conversation.pending_offer_price = int(transaction_data.sale_price * 100)  # Store as cents
    conversation.pending_offer_from_user_id = current_user.id
    conversation.pending_offer_at = datetime.utcnow()
    conversation.updated_by = current_user.username
    
    # Create a message about the offer
    if is_seller:
        offer_message_content = f"💰 Purchase offer: ${transaction_data.sale_price:.2f}"
    else:
        offer_message_content = f"💵 Offer: ${transaction_data.sale_price:.2f}"
    
    offer_message = Message(
        conversation_id=conversation_id,
        sender_id=current_user.id,
        content=offer_message_content,
        created_by=current_user.username
    )
    db.add(offer_message)
    conversation.last_message_at = datetime.utcnow()
    
    db.commit()
    
    # Send notification to the other user
    other_user = db.query(User).filter(User.id == other_user_id).first()
    if other_user:
        if is_seller:
            notification_title = "New Purchase Offer"
            notification_message = f"{current_user.full_name} offered to sell {item.title} for ${transaction_data.sale_price:.2f}"
        else:
            notification_title = "New Offer"
            notification_message = f"{current_user.full_name} made an offer of ${transaction_data.sale_price:.2f} for {item.title}"
        
        create_notification(
            db=db,
            user_id=other_user_id,
            notification_type=NotificationType.SYSTEM,
            title=notification_title,
            message=notification_message,
            related_item_id=item.id,
            related_conversation_id=conversation_id,
            related_user_id=current_user.id
        )
    
    # Send WebSocket notification
    if other_user_id in active_connections:
        try:
            await active_connections[other_user_id].send_json({
                "type": "purchase_offer",
                "data": {
                    "conversation_id": conversation_id,
                    "item_id": item.id,
                    "item_title": item.title,
                    "offerer_name": current_user.full_name,
                    "offer_price": transaction_data.sale_price,
                    "original_price": item.price,
                    "is_from_seller": is_seller
                }
            })
        except Exception as e:
            print(f"Error sending offer notification via WebSocket: {e}")
    
    # Also send message notification
    if other_user_id in active_connections:
        try:
            await active_connections[other_user_id].send_json({
                "type": "message",
                "data": {
                    "id": offer_message.id,
                    "conversation_id": offer_message.conversation_id,
                    "sender_id": offer_message.sender_id,
                    "content": offer_message.content,
                    "is_read": False,
                    "created_at": offer_message.created_at.isoformat(),
                    "sender_username": current_user.username,
                    "sender_full_name": current_user.full_name
                }
            })
        except Exception as e:
            print(f"Error sending message via WebSocket: {e}")
    
    return {"message": "Purchase offer sent", "offer_price": transaction_data.sale_price}


@router.post("/conversations/{conversation_id}/respond-offer")
async def respond_to_offer(
    conversation_id: int,
    response_data: dict,  # {"action": "accept" | "reject" | "counter", "counter_price": float (optional)}
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Respond to a purchase offer (buyer accepts/rejects/counters)"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to respond to offers in this conversation"
        )
    
    # Check if there's a pending offer
    if not conversation.pending_offer_price or not conversation.pending_offer_from_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No pending offer to respond to"
        )
    
    # Get item
    item = db.query(Item).filter(Item.id == conversation.item_id).first()
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Item not found"
        )
    
    # Get seller and buyer - seller is always the item owner
    seller_id = item.seller_id
    buyer_id = conversation.user2_id if conversation.user1_id == seller_id else conversation.user1_id
    
    action = response_data.get("action")
    
    if action == "accept":
        # Create transaction
        sale_price = conversation.pending_offer_price / 100.0  # Convert from cents
        transaction = Transaction(
            item_id=conversation.item_id,
            seller_id=seller_id,
            buyer_id=buyer_id,
            conversation_id=conversation_id,
            sale_price=sale_price,
            original_price=item.price,
            is_completed=True,
            completed_at=datetime.utcnow(),
            created_by=current_user.username
        )
        db.add(transaction)
        
        # Update item status
        item.status = "SOLD"
        item.updated_by = current_user.username
        
        # Update conversation
        conversation.is_sold = True
        conversation.sold_at = datetime.utcnow()
        conversation.transaction_id = transaction.id
        conversation.is_ended = True
        conversation.ended_at = datetime.utcnow()
        conversation.pending_offer_price = None
        conversation.pending_offer_from_user_id = None
        conversation.pending_offer_at = None
        conversation.updated_by = current_user.username
        
        # Create acceptance message
        accept_message = Message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            content=f"✅ Accepted offer: ${sale_price:.2f}",
            created_by=current_user.username
        )
        db.add(accept_message)
        conversation.last_message_at = datetime.utcnow()
        
        db.commit()
        db.refresh(transaction)
        transaction_response = serialize_transaction(transaction)
        
        # Send notifications to both parties
        seller = db.query(User).filter(User.id == seller_id).first()
        buyer = db.query(User).filter(User.id == buyer_id).first()
        
        # Notify the other party (not the one who accepted)
        other_party_id = buyer_id if current_user.id == seller_id else seller_id
        other_party = buyer if current_user.id == seller_id else seller
        
        if other_party:
            create_notification(
                db=db,
                user_id=other_party_id,
                notification_type=NotificationType.SYSTEM,
                title="Offer Accepted!",
                message=f"{current_user.full_name} accepted your offer for {item.title}",
                related_item_id=item.id,
                related_conversation_id=conversation_id,
                related_user_id=current_user.id
            )
        
        # Send WebSocket notifications to BOTH parties IMMEDIATELY
        # This ensures both seller and buyer see confetti, rating option, and sold banner
        for user_id in [seller_id, buyer_id]:
            role = "seller" if user_id == seller_id else "buyer"
            if user_id in active_connections:
                try:
                    transaction_payload = transaction_response.model_dump()
                    for key in ("completed_at", "created_at"):
                        value = transaction_payload.get(key)
                        if isinstance(value, datetime):
                            transaction_payload[key] = value.isoformat()

                    await active_connections[user_id].send_json({
                        "type": "item_sold",
                        "data": {
                            "transaction_id": transaction.id,
                            "conversation_id": conversation_id,
                            "item_id": item.id,
                            "item_title": item.title,
                            "seller_name": seller.full_name if seller else "Unknown",
                            "buyer_name": buyer.full_name if buyer else "Unknown",
                            "sale_price": transaction.sale_price,
                            "original_price": transaction.original_price,
                            "transaction": transaction_payload,
                            "transaction_id": transaction.id  # Ensure transaction_id is included
                        }
                    })
                    log_confetti_event(user_id, role, conversation_id, transaction.id, item.id)
                except Exception as e:
                    logger.error(f"Error sending sold notification via WebSocket: {e}", exc_info=True)
            else:
                logger.debug(
                    "Confetti socket not connected",
                    extra={
                        "event": "confetti_no_connection",
                        "user_id": user_id,
                        "role": role,
                        "conversation_id": conversation_id,
                        "transaction_id": transaction.id,
                    },
                )
        
        # Also send conversation update to refresh UI for both parties
        await broadcast_conversation_update(conversation, db)
        
        return transaction_response
    
    elif action == "reject":
        # Clear pending offer
        conversation.pending_offer_price = None
        conversation.pending_offer_from_user_id = None
        conversation.pending_offer_at = None
        conversation.updated_by = current_user.username
        
        # Create rejection message
        reject_message = Message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            content="❌ Rejected the offer",
            created_by=current_user.username
        )
        db.add(reject_message)
        conversation.last_message_at = datetime.utcnow()
        
        db.commit()
        
        # Send notification to the offer sender
        offer_sender_id = conversation.pending_offer_from_user_id if hasattr(conversation, 'pending_offer_from_user_id') else None
        if offer_sender_id:
            offer_sender = db.query(User).filter(User.id == offer_sender_id).first()
            if offer_sender:
                create_notification(
                    db=db,
                    user_id=offer_sender_id,
                    notification_type=NotificationType.SYSTEM,
                    title="Offer Rejected",
                    message=f"{current_user.full_name} rejected your offer for {item.title}",
                    related_item_id=item.id,
                    related_conversation_id=conversation_id,
                    related_user_id=current_user.id
                )
        
        # Broadcast conversation update
        await broadcast_conversation_update(conversation, db)
        
        # Return success response (not TransactionResponse)
        return {"message": "Offer rejected", "success": True}
    
    elif action == "counter":
        counter_price = response_data.get("counter_price")
        if not counter_price or counter_price <= 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid counter offer price"
            )
        
        # Get the other user (who will receive the counter offer)
        other_user_id = conversation.user2_id if conversation.user1_id == current_user.id else conversation.user1_id
        
        # Update pending offer (now from current user to other user)
        conversation.pending_offer_price = int(counter_price * 100)  # Store as cents
        conversation.pending_offer_from_user_id = current_user.id
        conversation.pending_offer_at = datetime.utcnow()
        conversation.updated_by = current_user.username
        
        # Create counter message
        counter_message = Message(
            conversation_id=conversation_id,
            sender_id=current_user.id,
            content=f"💵 Counter offer: ${counter_price:.2f}",
            created_by=current_user.username
        )
        db.add(counter_message)
        conversation.last_message_at = datetime.utcnow()
        
        db.commit()
        
        # Send notification to the other user
        other_user = db.query(User).filter(User.id == other_user_id).first()
        if other_user:
            create_notification(
                db=db,
                user_id=other_user_id,
                notification_type=NotificationType.SYSTEM,
                title="Counter Offer",
                message=f"{current_user.full_name} countered with ${counter_price:.2f} for {item.title}",
                related_item_id=item.id,
                related_conversation_id=conversation_id,
                related_user_id=current_user.id
            )
        
        # Send WebSocket notification
        if other_user_id in active_connections:
            try:
                await active_connections[other_user_id].send_json({
                    "type": "purchase_offer",
                    "data": {
                        "conversation_id": conversation_id,
                        "item_id": item.id,
                        "item_title": item.title,
                        "offerer_name": current_user.full_name,
                        "offer_price": counter_price,
                        "original_price": item.price,
                        "is_from_seller": item.seller_id == current_user.id
                    }
                })
            except Exception as e:
                print(f"Error sending counter offer notification via WebSocket: {e}")
        
        # Broadcast conversation update
        await broadcast_conversation_update(conversation, db)
        
        # Return success response (not TransactionResponse)
        return {"message": "Counter offer sent", "offer_price": counter_price, "success": True}
    
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid action. Must be 'accept', 'reject', or 'counter'"
        )


@router.get("/transactions/{transaction_id}/ratings")
def get_transaction_ratings(
    transaction_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all ratings for a transaction"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Verify user is part of the transaction
    if transaction.seller_id != current_user.id and transaction.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view ratings for this transaction"
        )
    
    ratings = db.query(Rating).filter(Rating.transaction_id == transaction_id).all()
    
    return {
        "ratings": [
            RatingResponse(
                id=rating.id,
                transaction_id=rating.transaction_id,
                rater_id=rating.rater_id,
                rated_user_id=rating.rated_user_id,
                rating=rating.rating,
                comment=rating.comment,
                created_at=rating.created_at
            )
            for rating in ratings
        ],
        "has_rated": any(rating.rater_id == current_user.id for rating in ratings)
    }


@router.post("/transactions/{transaction_id}/rate", response_model=RatingResponse)
def rate_user(
    transaction_id: int,
    rating_data: RatingCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Rate a user after a transaction"""
    transaction = db.query(Transaction).filter(Transaction.id == transaction_id).first()
    if not transaction:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Transaction not found"
        )
    
    # Verify user is part of the transaction
    if transaction.seller_id != current_user.id and transaction.buyer_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to rate for this transaction"
        )
    
    # Verify rated_user_id is the other party
    other_user_id = transaction.buyer_id if transaction.seller_id == current_user.id else transaction.seller_id
    if rating_data.rated_user_id != other_user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Can only rate the other party in the transaction"
        )
    
    # Check if already rated
    existing_rating = db.query(Rating).filter(
        Rating.transaction_id == transaction_id,
        Rating.rater_id == current_user.id
    ).first()
    
    if existing_rating:
        # Update existing rating
        existing_rating.rating = rating_data.rating
        existing_rating.comment = rating_data.comment
        existing_rating.updated_by = current_user.username
        db.commit()
        db.refresh(existing_rating)
        return RatingResponse(
            id=existing_rating.id,
            transaction_id=existing_rating.transaction_id,
            rater_id=existing_rating.rater_id,
            rated_user_id=existing_rating.rated_user_id,
            rating=existing_rating.rating,
            comment=existing_rating.comment,
            created_at=existing_rating.created_at
        )
    
    # Create new rating
    rating = Rating(
        transaction_id=transaction_id,
        rater_id=current_user.id,
        rated_user_id=rating_data.rated_user_id,
        rating=rating_data.rating,
        comment=rating_data.comment,
        created_by=current_user.username
    )
    db.add(rating)
    db.commit()
    db.refresh(rating)
    
    return RatingResponse(
        id=rating.id,
        transaction_id=rating.transaction_id,
        rater_id=rating.rater_id,
        rated_user_id=rating.rated_user_id,
        rating=rating.rating,
        comment=rating.comment,
        created_at=rating.created_at
    )


@router.get("/transactions/summary", response_model=UserTransactionSummaryResponse)
def get_user_transaction_summary(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get aggregated sales/purchases info for the current user"""
    sales = db.query(Transaction).filter(
        Transaction.seller_id == current_user.id,
        Transaction.is_completed == True
    ).order_by(Transaction.completed_at.desc().nullslast()).all()

    purchases = db.query(Transaction).filter(
        Transaction.buyer_id == current_user.id,
        Transaction.is_completed == True
    ).order_by(Transaction.completed_at.desc().nullslast()).all()

    total_earned = sum(tx.sale_price for tx in sales)
    total_spent = sum(tx.sale_price for tx in purchases)

    return UserTransactionSummaryResponse(
        sales=[serialize_transaction_detail(tx) for tx in sales],
        purchases=[serialize_transaction_detail(tx) for tx in purchases],
        sold_items=len(sales),
        purchased_items=len(purchases),
        total_amount_earned=total_earned,
        total_amount_spent=total_spent
    )


@router.get("/users/{user_id}/rating-summary")
def get_user_rating_summary(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get aggregate rating info for a specific user"""
    ratings = db.query(Rating).filter(Rating.rated_user_id == user_id).all()
    if not ratings:
        return {
            "average_rating": None,
            "rating_count": 0,
            "viewer_rating": None
        }
    
    total = sum(r.rating for r in ratings)
    count = len(ratings)
    average = round(total / count, 2)
    viewer_rating = next((r.rating for r in ratings if r.rater_id == current_user.id), None)
    
    return {
        "average_rating": average,
        "rating_count": count,
        "viewer_rating": viewer_rating
    }


@router.get("/conversations/reported")
def get_reported_conversations(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get all reported conversations (admin only)"""
    from ..enums.user import UserRole
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only admins can view reported conversations"
        )
    
    reported_conversations = db.query(Conversation).filter(
        Conversation.is_reported == True
    ).order_by(Conversation.reported_at.desc()).all()
    
    result = []
    for conv in reported_conversations:
        reporter = db.query(User).filter(User.id == conv.reported_by).first()
        result.append({
            "id": conv.id,
            "user1_id": conv.user1_id,
            "user2_id": conv.user2_id,
            "item_id": conv.item_id,
            "is_reported": conv.is_reported,
            "reported_at": conv.reported_at,
            "reported_by": conv.reported_by,
            "report_reason": conv.report_reason,
            "reporter_name": reporter.full_name if reporter else "Unknown",
            "created_at": conv.created_at
        })
    
    return result


@router.put("/conversations/{conversation_id}/continue")
def continue_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Allow continued chatting after sale"""
    conversation = db.query(Conversation).filter(Conversation.id == conversation_id).first()
    if not conversation:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Conversation not found"
        )
    
    # Check if user is part of the conversation
    if conversation.user1_id != current_user.id and conversation.user2_id != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to continue this conversation"
        )
    
    # Un-end the conversation
    conversation.is_ended = False
    conversation.ended_at = None
    conversation.updated_by = current_user.username
    db.commit()
    
    return {"message": "Conversation can now continue"}


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(websocket: WebSocket, user_id: int):
    """WebSocket endpoint for real-time chat"""
    # Get token from query parameters
    token = websocket.query_params.get("token")
    
    if not token:
        await websocket.close(code=1008, reason="Token required")
        return
    
    # Verify token
    try:
        from ..auth.jwt_handler import verify_token
        token_data = verify_token(token)
        
        # Verify user_id matches token
        if token_data.user_id != user_id:
            await websocket.close(code=1008, reason="User ID mismatch")
            return
    except Exception as e:
        await websocket.close(code=1008, reason="Invalid token")
        return
    
    await websocket.accept()
    active_connections[user_id] = websocket
    
    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            # Echo back or handle ping/pong
            await websocket.send_json({"type": "pong", "data": data})
    except WebSocketDisconnect:
        if user_id in active_connections:
            del active_connections[user_id]
    except Exception as e:
        print(f"WebSocket error: {e}")
        if user_id in active_connections:
            del active_connections[user_id]

