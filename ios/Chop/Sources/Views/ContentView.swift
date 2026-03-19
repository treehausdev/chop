import SwiftUI
import UniformTypeIdentifiers

struct ContentView: View {
    @State private var viewModel = ChopViewModel()
    
    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            
            if let track = viewModel.audioEngine.choppedTrack {
                VStack(spacing: 0) {
                    // Header
                    TrackHeader(name: track.name) {
                        viewModel.showFilePicker = true
                    }
                    
                    Spacer()
                    
                    // 4x4 Pad Grid
                    PadGrid(
                        samples: track.samples,
                        activePadIndex: viewModel.activePadIndex,
                        onTap: viewModel.tapPad
                    )
                    .padding(.horizontal, 16)
                    
                    Spacer()
                }
            } else if viewModel.audioEngine.isLoading {
                ProgressView("Chopping...")
                    .tint(.white)
                    .foregroundStyle(.white)
            } else {
                // Empty state
                ImportView {
                    viewModel.showFilePicker = true
                }
            }
        }
        .fileImporter(
            isPresented: $viewModel.showFilePicker,
            allowedContentTypes: [.audio, .mp3, .wav, .aiff],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                viewModel.loadFile(url: url)
            }
        }
        .onAppear {
            viewModel.setup()
        }
    }
}

// MARK: - Track Header

struct TrackHeader: View {
    let name: String
    let onNewTrack: () -> Void
    
    var body: some View {
        HStack {
            VStack(alignment: .leading, spacing: 2) {
                Text("CHOP")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.gray)
                    .tracking(2)
                
                Text(name)
                    .font(.title2)
                    .fontWeight(.bold)
                    .foregroundStyle(.white)
                    .lineLimit(1)
            }
            
            Spacer()
            
            Button(action: onNewTrack) {
                Image(systemName: "plus.circle.fill")
                    .font(.title2)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.horizontal, 20)
        .padding(.top, 16)
        .padding(.bottom, 8)
    }
}

// MARK: - Import View

struct ImportView: View {
    let onImport: () -> Void
    
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "waveform.circle.fill")
                .font(.system(size: 80))
                .foregroundStyle(.orange)
            
            Text("CHOP")
                .font(.largeTitle)
                .fontWeight(.black)
                .foregroundStyle(.white)
                .tracking(4)
            
            Text("Sample any song.\nFinger-drum your own beats.")
                .font(.body)
                .foregroundStyle(.gray)
                .multilineTextAlignment(.center)
            
            Button(action: onImport) {
                Label("Import Audio", systemImage: "square.and.arrow.down")
                    .font(.headline)
                    .foregroundStyle(.black)
                    .padding(.horizontal, 32)
                    .padding(.vertical, 14)
                    .background(.orange)
                    .clipShape(Capsule())
            }
        }
    }
}
