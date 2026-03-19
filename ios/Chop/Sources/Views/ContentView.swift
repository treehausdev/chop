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
                        viewModel.showImportOptions = true
                    }
                    
                    // Waveform
                    WaveformView(
                        waveformData: viewModel.audioEngine.waveformData,
                        samples: track.samples,
                        totalDuration: track.totalDuration,
                        playingSampleId: viewModel.audioEngine.playingSampleId,
                        selectedSliceIndex: viewModel.selectedSliceIndex,
                        onSelectSlice: { idx in
                            viewModel.selectSlice(idx)
                        },
                        onBoundaryDrag: { idx, time in
                            viewModel.moveBoundary(at: idx, to: time)
                        }
                    )
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    
                    // Slice info bar
                    if let selected = viewModel.selectedSample {
                        SliceInfoBar(sample: selected) {
                            viewModel.showSliceDetail = true
                        } onReset: {
                            viewModel.resetSlices()
                        }
                        .padding(.horizontal, 16)
                        .padding(.top, 8)
                        .transition(.move(edge: .top).combined(with: .opacity))
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
                .animation(.easeInOut(duration: 0.2), value: viewModel.selectedSliceIndex)
            } else if viewModel.audioEngine.isLoading {
                ProgressView("Chopping...")
                    .tint(.white)
                    .foregroundStyle(.white)
            } else {
                // Empty state
                ImportView(
                    onFilePicker: { viewModel.showFilePicker = true },
                    onMusicLibrary: { viewModel.showMusicLibrary = true },
                    onDeezerSearch: { viewModel.showDeezerSearch = true }
                )
            }
        }
        // File importer
        .fileImporter(
            isPresented: $viewModel.showFilePicker,
            allowedContentTypes: [.audio, .mp3, .wav, .aiff],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                viewModel.loadFile(url: url)
            }
        }
        // Music Library picker
        .fullScreenCover(isPresented: $viewModel.showMusicLibrary) {
            MusicLibraryPicker(
                onPick: { url in viewModel.loadFromMusicLibrary(url: url) },
                onCancel: { viewModel.showMusicLibrary = false }
            )
            .ignoresSafeArea()
        }
        // Deezer search
        .sheet(isPresented: $viewModel.showDeezerSearch) {
            DeezerSearchView(
                onSelect: { url, name in viewModel.loadFromDeezer(url: url, name: name) },
                onCancel: { viewModel.showDeezerSearch = false }
            )
            .presentationBackground(Color.black)
        }
        // Import options action sheet (when track already loaded)
        .confirmationDialog("Import Audio", isPresented: $viewModel.showImportOptions) {
            Button("Files") { viewModel.showFilePicker = true }
            Button("Music Library") { viewModel.showMusicLibrary = true }
            Button("Search Songs") { viewModel.showDeezerSearch = true }
            Button("Cancel", role: .cancel) {}
        }
        // Slice detail sheet
        .sheet(isPresented: $viewModel.showSliceDetail) {
            if let sample = viewModel.selectedSample {
                SliceDetailSheet(
                    sample: sample,
                    onPlay: { viewModel.tapPad(sample) },
                    onReset: { viewModel.resetSlices() }
                )
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
        .padding(.bottom, 4)
    }
}

// MARK: - Slice Info Bar

struct SliceInfoBar: View {
    let sample: Sample
    let onDetail: () -> Void
    let onReset: () -> Void
    
    var body: some View {
        HStack(spacing: 12) {
            Text("Slice \(sample.id + 1)")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(.orange)
            
            Text(formatTime(sample.startTime) + " → " + formatTime(sample.endTime))
                .font(.system(.caption, design: .monospaced))
                .foregroundStyle(.gray)
            
            Spacer()
            
            Button(action: onReset) {
                Image(systemName: "arrow.counterclockwise")
                    .font(.caption)
                    .foregroundStyle(.gray)
            }
            
            Button(action: onDetail) {
                Image(systemName: "info.circle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.06))
        .clipShape(RoundedRectangle(cornerRadius: 8))
    }
    
    private func formatTime(_ t: TimeInterval) -> String {
        let s = Int(t) % 60
        let m = Int(t) / 60
        let ms = Int((t.truncatingRemainder(dividingBy: 1)) * 100)
        return String(format: "%d:%02d.%02d", m, s, ms)
    }
}

// MARK: - Import View

struct ImportView: View {
    let onFilePicker: () -> Void
    let onMusicLibrary: () -> Void
    let onDeezerSearch: () -> Void
    
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
            
            VStack(spacing: 10) {
                // Primary: Search songs
                Button(action: onDeezerSearch) {
                    Label("Search Songs", systemImage: "magnifyingglass")
                        .font(.headline)
                        .foregroundStyle(.black)
                        .frame(maxWidth: 260)
                        .padding(.vertical, 14)
                        .background(.orange)
                        .clipShape(Capsule())
                }
                
                // Secondary: Music Library
                Button(action: onMusicLibrary) {
                    Label("Music Library", systemImage: "music.note.list")
                        .font(.subheadline)
                        .fontWeight(.medium)
                        .foregroundStyle(.orange)
                        .frame(maxWidth: 260)
                        .padding(.vertical, 12)
                        .background(Color.orange.opacity(0.15))
                        .clipShape(Capsule())
                }
                
                // Tertiary: Import file
                Button(action: onFilePicker) {
                    Label("Import File", systemImage: "square.and.arrow.down")
                        .font(.subheadline)
                        .foregroundStyle(.gray)
                        .frame(maxWidth: 260)
                        .padding(.vertical, 12)
                }
            }
        }
    }
}
