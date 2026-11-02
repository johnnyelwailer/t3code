import UIKit

let reviewDiffImageRowHeight: CGFloat = 240
private let panelGap: CGFloat = 8
private let panelPadding: CGFloat = 12
private let labelHeight: CGFloat = 22
private let panelRadius: CGFloat = 6
private let maxImageBytes = 20 * 1024 * 1024

enum ReviewDiffImageState {
  case loading
  case unavailable
  case ready(UIImage)
}

/// Each side's panel, left to right, inside an image row.
func reviewDiffImagePanels(sides: [String], rect: CGRect) -> [(side: String, rect: CGRect)] {
  guard !sides.isEmpty else { return [] }
  let count = CGFloat(sides.count)
  let panelWidth = (rect.width - panelPadding * 2 - panelGap * (count - 1)) / count
  return sides.enumerated().map { index, side in
    let left = rect.minX + panelPadding + CGFloat(index) * (panelWidth + panelGap)
    return (side: side, rect: CGRect(
      x: left,
      y: rect.minY + panelPadding,
      width: panelWidth,
      height: rect.height - panelPadding * 2
    ))
  }
}

func reviewDiffImageSide(sides: [String], x: CGFloat, width: CGFloat) -> String? {
  reviewDiffImagePanels(sides: sides, rect: CGRect(x: 0, y: 0, width: width, height: 1))
    .first { x >= $0.rect.minX && x <= $0.rect.maxX }?.side
}

func decodeReviewDiffImageUris(_ json: String) -> [String: [String: String]] {
  guard let data = json.data(using: .utf8),
        let decoded = try? JSONDecoder().decode([String: [String: String]].self, from: data) else {
    return [:]
  }
  return decoded
}

/// Fetches and decodes the signed asset URLs of image rows off the main thread.
final class ReviewDiffImageLoader {
  private let cache = NSCache<NSString, UIImage>()
  private var pending = Set<String>()
  private var failed = Set<String>()
  private let onLoaded: () -> Void

  init(onLoaded: @escaping () -> Void) {
    self.onLoaded = onLoaded
    cache.totalCostLimit = 48 * 1024 * 1024
  }

  func state(for urlString: String?) -> ReviewDiffImageState {
    guard let urlString else { return .loading }
    if let image = cache.object(forKey: urlString as NSString) { return .ready(image) }
    if failed.contains(urlString) { return .unavailable }
    guard !pending.contains(urlString), let url = URL(string: urlString) else { return .loading }
    pending.insert(urlString)
    URLSession.shared.dataTask(with: url) { [weak self] data, response, _ in
      let status = (response as? HTTPURLResponse)?.statusCode ?? 0
      let image = (200..<300).contains(status) && (data?.count ?? 0) <= maxImageBytes
        ? data.flatMap { UIImage(data: $0)?.preparingForDisplay() }
        : nil
      DispatchQueue.main.async {
        guard let self else { return }
        self.pending.remove(urlString)
        if let image {
          let cost = Int(image.size.width * image.size.height * image.scale * image.scale * 4)
          self.cache.setObject(image, forKey: urlString as NSString, cost: cost)
        } else {
          self.failed.insert(urlString)
        }
        self.onLoaded()
      }
    }.resume()
    return .loading
  }
}

struct ReviewDiffImageRowColors {
  let panel: UIColor
  let mutedText: UIColor
  let beforeText: UIColor
  let afterText: UIColor
}

func drawReviewDiffImageRow(
  panels: [(side: String, rect: CGRect)],
  states: [ReviewDiffImageState],
  colors: ReviewDiffImageRowColors,
  font: UIFont
) {
  let labelSpace = panels.count > 1 ? labelHeight : 0
  for (index, panel) in panels.enumerated() {
    colors.panel.setFill()
    UIBezierPath(roundedRect: panel.rect, cornerRadius: panelRadius).fill()
    if labelSpace > 0 {
      let isOld = panel.side == "old"
      (isOld ? "Before" : "After").draw(
        at: CGPoint(x: panel.rect.minX + panelPadding, y: panel.rect.minY + (labelSpace - font.lineHeight) / 2 + 4),
        withAttributes: [.font: font, .foregroundColor: isOld ? colors.beforeText : colors.afterText]
      )
    }
    let area = CGRect(
      x: panel.rect.minX,
      y: panel.rect.minY + labelSpace,
      width: panel.rect.width,
      height: panel.rect.height - labelSpace
    ).insetBy(dx: panelPadding / 2, dy: panelPadding / 2)
    switch index < states.count ? states[index] : .loading {
    case let .ready(image):
      drawFitted(image, in: area)
    case .unavailable:
      drawCaption("Preview unavailable", in: area, color: colors.mutedText, font: font)
    case .loading:
      drawCaption("Loading image…", in: area, color: colors.mutedText, font: font)
    }
  }
}

private func drawFitted(_ image: UIImage, in area: CGRect) {
  guard image.size.width > 0, image.size.height > 0 else { return }
  let scale = min(1, min(area.width / image.size.width, area.height / image.size.height))
  let size = CGSize(width: image.size.width * scale, height: image.size.height * scale)
  image.draw(in: CGRect(
    x: area.midX - size.width / 2,
    y: area.midY - size.height / 2,
    width: size.width,
    height: size.height
  ))
}

private func drawCaption(_ text: String, in area: CGRect, color: UIColor, font: UIFont) {
  let attributes: [NSAttributedString.Key: Any] = [.font: font, .foregroundColor: color]
  let size = (text as NSString).size(withAttributes: attributes)
  text.draw(at: CGPoint(x: area.midX - size.width / 2, y: area.midY - size.height / 2), withAttributes: attributes)
}
