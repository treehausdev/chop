import SwiftUI
import MediaPlayer

/// UIViewControllerRepresentable wrapper for MPMediaPickerController
struct MusicLibraryPicker: UIViewControllerRepresentable {
    let onPick: (URL) -> Void
    let onCancel: () -> Void
    
    func makeUIViewController(context: Context) -> MPMediaPickerController {
        let picker = MPMediaPickerController(mediaTypes: .music)
        picker.delegate = context.coordinator
        picker.allowsPickingMultipleItems = false
        picker.showsCloudItems = false // Local only
        picker.showsItemsWithProtectedAssets = false
        picker.prompt = "Choose a song to chop"
        
        // Style it dark
        picker.view.backgroundColor = .black
        picker.overrideUserInterfaceStyle = .dark
        
        return picker
    }
    
    func updateUIViewController(_ uiViewController: MPMediaPickerController, context: Context) {}
    
    func makeCoordinator() -> Coordinator {
        Coordinator(onPick: onPick, onCancel: onCancel)
    }
    
    final class Coordinator: NSObject, MPMediaPickerControllerDelegate {
        let onPick: (URL) -> Void
        let onCancel: () -> Void
        
        init(onPick: @escaping (URL) -> Void, onCancel: @escaping () -> Void) {
            self.onPick = onPick
            self.onCancel = onCancel
        }
        
        func mediaPicker(_ mediaPicker: MPMediaPickerController, didPickMediaItems mediaItemCollection: MPMediaItemCollection) {
            guard let item = mediaItemCollection.items.first,
                  let url = item.assetURL else {
                onCancel()
                return
            }
            onPick(url)
        }
        
        func mediaPickerDidCancel(_ mediaPicker: MPMediaPickerController) {
            onCancel()
        }
    }
}
