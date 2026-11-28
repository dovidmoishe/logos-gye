import ManagedSettings
import ManagedSettingsUI
import UIKit

final class ShieldConfigurationExtension: ShieldConfigurationDataSource {
    private var pause: ShieldConfiguration {
        let purple = UIColor(red: 0.38, green: 0.28, blue: 0.48, alpha: 1)
        return ShieldConfiguration(
            backgroundBlurStyle: nil,
            backgroundColor: UIColor(red: 0.98, green: 0.97, blue: 0.96, alpha: 1),
            icon: UIImage(named: "Mark")?.preparingThumbnail(of: CGSize(width: 72, height: 72)),
            title: .init(text: "Take a breath.", color: UIColor(white: 0.12, alpha: 1)),
            subtitle: .init(text: "You set this boundary for yourself.", color: purple),
            primaryButtonLabel: .init(text: "Close", color: .white),
            primaryButtonBackgroundColor: purple
        )
    }
    override func configuration(shielding application: Application) -> ShieldConfiguration { pause }
    override func configuration(shielding application: Application, in category: ActivityCategory) -> ShieldConfiguration { pause }
    override func configuration(shielding webDomain: WebDomain) -> ShieldConfiguration { pause }
    override func configuration(shielding webDomain: WebDomain, in category: ActivityCategory) -> ShieldConfiguration { pause }
}
