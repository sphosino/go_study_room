class FlyIOSSLRedirectMiddleware:
    """Fly.io のプロキシヘッダーから HTTPS を検出するミドルウェア"""
    
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        # Fly.io のヘッダーをチェック
        if request.META.get('HTTP_X_FORWARDED_PROTO') == 'https':
            request.is_secure = lambda: True
            request.scheme = 'https'
        
        # X-Forwarded-Host を使用
        if request.META.get('HTTP_X_FORWARDED_HOST'):
            request.META['HTTP_HOST'] = request.META.get('HTTP_X_FORWARDED_HOST')
        
        response = self.get_response(request)
        return response
