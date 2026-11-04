package org.qweeps.app;

import android.app.*;
import android.content.*;
import android.os.*;
import com.chaquo.python.*;
import com.chaquo.python.android.AndroidPlatform;
import org.json.JSONObject;
import java.io.*;
import java.util.concurrent.*;

/** Owns the Python runtime and advertises only active, user-started work. */
public class PythonService extends Service {
    private static final int NOTIFICATION = 4174;
    private static final String CHANNEL = "qweeps-generation";
    private final IBinder binder = new LocalBinder();
    private final ScheduledExecutorService worker = Executors.newSingleThreadScheduledExecutor();
    private volatile boolean ready, destroyed;
    private volatile String failure;
    private volatile int clients;
    private PyObject runtime;
    private boolean foreground = false;
    private PowerManager.WakeLock wakeLock;
    public class LocalBinder extends Binder { public PythonService service() { return PythonService.this; } }
    public boolean isReady() { return ready; }
    public String getFailure() { return failure; }

    @Override public void onCreate() {
        super.onCreate();
        NotificationManager manager = getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel(CHANNEL, "Lesson generation", NotificationManager.IMPORTANCE_LOW));
        wakeLock = ((PowerManager)getSystemService(POWER_SERVICE)).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "QWEEPS:generation");
        wakeLock.setReferenceCounted(false);
        showForeground("Starting QWEEPS");
        worker.execute(() -> {
            try {
                File studio = new File(getFilesDir(), "studio");
                copyAssets("studio", studio);
                if (!Python.isStarted()) Python.start(new AndroidPlatform(getApplicationContext()));
                runtime = Python.getInstance().getModule("qweeps_android");
                runtime.callAttr("start", getFilesDir().getAbsolutePath(), studio.getAbsolutePath(), 4174);
                ready = true;
            } catch (Exception exc) {
                failure = "QWEEPS could not start. " + exc.getMessage();
                stopForeground(STOP_FOREGROUND_REMOVE);
                foreground = false;
            }
        });
        worker.scheduleWithFixedDelay(this::monitor, 1, 2, TimeUnit.SECONDS);
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        showForeground("Opening QWEEPS");
        return START_NOT_STICKY;
    }
    @Override public IBinder onBind(Intent intent) { clients++; return binder; }
    @Override public boolean onUnbind(Intent intent) { clients = Math.max(0, clients - 1); return true; }
    @Override public void onRebind(Intent intent) { clients++; }

    private void monitor() {
        if (!ready || destroyed || runtime == null) return;
        try {
            JSONObject status = new JSONObject(runtime.callAttr("status").toString());
            int active = status.optInt("active");
            if (active > 0) {
                showForeground(status.optString("stage", "Generating lesson"));
                if (status.optInt("working") > 0) {
                    if (!wakeLock.isHeld()) wakeLock.acquire(20 * 60 * 1000L);
                } else releaseWakeLock();
            } else {
                releaseWakeLock();
                if (foreground) { stopForeground(STOP_FOREGROUND_REMOVE); foreground = false; }
                if (clients == 0) stopSelf();
            }
        } catch (Exception exc) { failure = "Background status unavailable. Reopen QWEEPS."; }
    }
    private void showForeground(String text) {
        Intent open = new Intent(this, MainActivity.class);
        PendingIntent content = PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        Notification notification = new Notification.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.pixel_q).setContentTitle("QWEEPS")
            .setContentText(text).setContentIntent(content).setOngoing(true).build();
        // A foreground service is started while the user opens the Activity.
        startForeground(NOTIFICATION, notification);
        foreground = true;
    }
    private void copyAssets(String source, File target) throws IOException {
        String[] children = getAssets().list(source);
        if (children != null && children.length > 0) {
            if (!target.isDirectory() && !target.mkdirs()) throw new IOException("Cannot prepare studio storage");
            for (String child : children) copyAssets(source + "/" + child, new File(target, child));
        } else {
            try (InputStream input = getAssets().open(source); OutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[32768]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer, 0, count);
            }
        }
    }
    private void releaseWakeLock() { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); }
    @Override public void onTimeout(int startId, int fgsType) {
        failure = "Android's background time limit was reached. Reopen QWEEPS to resume from the saved draft.";
        releaseWakeLock();
        stopSelf();
    }
    @Override public void onDestroy() {
        destroyed = true; ready = false; releaseWakeLock();
        worker.execute(() -> { if (runtime != null) runtime.callAttr("stop"); });
        worker.shutdown();
        super.onDestroy();
    }
}
