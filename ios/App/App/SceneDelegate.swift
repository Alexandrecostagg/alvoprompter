import UIKit
import Capacitor
#if canImport(GoogleSignIn)
import GoogleSignIn
#endif

class SceneDelegate: UIResponder, UIWindowSceneDelegate {
    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = scene as? UIWindowScene else { return }

        window = UIWindow(windowScene: windowScene)
        window?.rootViewController = CAPBridgeViewController()
        window?.makeKeyAndVisible()

        #if canImport(GoogleSignIn)
        for context in connectionOptions.urlContexts {
            if GIDSignIn.sharedInstance.handle(context.url) { return }
        }
        #endif
        SceneDelegateProxy.shared.scene(scene, willConnectTo: session, options: connectionOptions)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        #if canImport(GoogleSignIn)
        let unhandled = URLContexts.filter { !GIDSignIn.sharedInstance.handle($0.url) }
        if unhandled.isEmpty { return }
        SceneDelegateProxy.shared.scene(scene, openURLContexts: unhandled)
        #else
        SceneDelegateProxy.shared.scene(scene, openURLContexts: URLContexts)
        #endif
    }

    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        SceneDelegateProxy.shared.scene(scene, continue: userActivity)
    }
}
