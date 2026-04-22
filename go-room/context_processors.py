from django.conf import settings


def app_debug(request):
    return {
        'APP_DEBUG': settings.DEBUG,
    }