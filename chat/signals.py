# chat/signals.py
from django.dispatch import receiver
from django.db.models.signals import post_save, post_delete
from .models import ChatMessage, ChatRoom, ChatImage
import logging

logger = logging.getLogger(__name__)

@receiver(post_save, sender=ChatMessage)
def my_model_post_save(sender, instance, created, **kwargs):
    if created:
        logger.debug("ChatMessage created: %s", instance)
    else:
        logger.debug("ChatMessage updated: %s", instance)

@receiver(post_delete, sender=ChatImage)
def delete_image_file(sender, instance, **kwargs):
    if instance.image:
        try:
            instance.image.delete(save=False)
        except Exception as e:
            logger.warning("Image delete failed but ignored: %s", e)

    if hasattr(instance, "thumbnail") and instance.thumbnail:
        try:
            instance.thumbnail.delete(save=False)
        except Exception as e:
            logger.warning("Thumbnail delete failed but ignored: %s", e)

@receiver(post_delete, sender=ChatMessage)
def delete_chatMessage(sender, instance, **kwargs):
    logger.info("ChatMessage deleted: id=%s", instance.id)
    if instance.image:
        try:
            instance.image.delete()
        except Exception as e:
            logger.warning("ChatImage delete failed: %s", e)
        
@receiver(post_delete, sender= ChatRoom)
def delete_chat_room(sender, instance, **kwargs):
    logger.info("ChatRoom deleted: id=%s", instance.id)