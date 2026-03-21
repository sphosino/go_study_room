    function getCSRFToken() {
        return document.querySelector('meta[name="csrf-token"]').content;
    }
    function urlBase64ToUint8Array(base64String) {
        const padding = '='.repeat((4 - base64String.length % 4) % 4);
        const base64 = (base64String + padding)
            .replace(/-/g, '+')
            .replace(/_/g, '/');
        const rawData = window.atob(base64);
        return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
    }
    export async function registerPush(vapidkey) {
        if (Notification.permission !== "granted") {
            return;
        }
        try {
            if (!("serviceWorker" in navigator)) {
                console.log("SWなし");
                return;
            }
            if (!("PushManager" in window)) {
                console.log("PushManagerなし");
                return;
            }

            const registration = await navigator.serviceWorker.ready;
            console.log("SW ready OK");

            let subscription = await registration.pushManager.getSubscription();

			if(!subscription){
				subscription = await registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: urlBase64ToUint8Array(vapidkey)
				});
				console.log("新規subscribe")
			}else{
				console.log("既存subscription再利用")
			}

            const res = await fetch("/api/save-subscription/", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-CSRFToken": getCSRFToken()
                },
                body: JSON.stringify(subscription)
            });

            console.log("save status: " + res.status);

        } catch (e) {
            console.log("ERROR: " + e.message);
        }
    }