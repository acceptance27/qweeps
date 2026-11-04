package org.qweeps.app;

import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.ComponentName;
import android.os.IBinder;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import org.junit.Test;
import org.junit.runner.RunWith;
import static org.junit.Assert.*;
import com.chaquo.python.Python;
import com.chaquo.python.PyObject;
import com.chaquo.python.android.AndroidPlatform;
import java.io.*;
import java.net.*;
import org.json.JSONObject;

/** Exercises the packaged interpreter, backend imports, data files and HTTP origin. */
@RunWith(AndroidJUnit4.class)
public class PythonRuntimeTest {
    @Test public void testBundledPythonAndSameOriginStudio() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        File studio = new File(context.getFilesDir(), "runtime-test-studio");
        copy(context, "studio", studio);
        if (!Python.isStarted()) Python.start(new AndroidPlatform(context));
        PyObject runtime = Python.getInstance().getModule("qweeps_android");
        try {
            runtime.callAttr("start", context.getFilesDir().getAbsolutePath(), studio.getAbsolutePath(), 4174);
            JSONObject status = new JSONObject(runtime.callAttr("status").toString());
            assertTrue(status.getBoolean("ready"));
            JSONObject health = new JSONObject(get("/api/visual/health"));
            assertEquals("qweeps-visual", health.getString("service"));
            assertFalse(health.getBoolean("manimReady"));
            assertTrue(get("/?home=1").contains("QWEEPS"));
            assertTrue(get("/api/visual/settings").contains("processes"));
            assertNotNull(Python.getInstance().getModule("pypdf").get("PdfReader"));
        } finally {
            runtime.callAttr("stop");
        }
    }
    @Test public void testForegroundServiceStartsBundledBackend() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        CountDownLatch connected = new CountDownLatch(1);
        PythonService[] service = new PythonService[1];
        ServiceConnection connection = new ServiceConnection() {
            @Override public void onServiceConnected(ComponentName name, IBinder binder) {
                service[0] = ((PythonService.LocalBinder)binder).service();
                connected.countDown();
            }
            @Override public void onServiceDisconnected(ComponentName name) {}
        };
        assertTrue(context.bindService(new Intent(context, PythonService.class), connection, Context.BIND_AUTO_CREATE));
        try {
            assertTrue(connected.await(30, TimeUnit.SECONDS));
            long deadline = System.currentTimeMillis() + 30000;
            while (!service[0].isReady() && service[0].getFailure() == null && System.currentTimeMillis() < deadline) Thread.sleep(100);
            assertNull(service[0].getFailure());
            assertTrue(service[0].isReady());
            assertTrue(get("/api/visual/health").contains("qweeps-visual"));
        } finally { context.unbindService(connection); }
    }

    private String get(String path) throws Exception {
        HttpURLConnection connection = (HttpURLConnection)new URL("http://127.0.0.1:4174" + path).openConnection();
        connection.setConnectTimeout(10000); connection.setReadTimeout(10000);
        try {
            assertEquals(200, connection.getResponseCode());
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] buffer = new byte[8192]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer,0,count);
            }
            return output.toString("UTF-8");
        } finally { connection.disconnect(); }
    }
    private void copy(Context context, String source, File target) throws IOException {
        String[] children = context.getAssets().list(source);
        if (children != null && children.length > 0) {
            target.mkdirs();
            for (String child : children) copy(context, source+"/"+child, new File(target,child));
        } else {
            try (InputStream input = context.getAssets().open(source); OutputStream output = new FileOutputStream(target)) {
                byte[] buffer = new byte[32768]; int count;
                while ((count = input.read(buffer)) != -1) output.write(buffer,0,count);
            }
        }
    }
}
